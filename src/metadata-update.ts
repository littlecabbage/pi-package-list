import { closeSync, fstatSync, openSync, readSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { LoadedExtension } from "./host-patch.ts";
import { findPackageManifest } from "./package-name.ts";

export type MetadataDocument = Record<string, unknown> & { extensions?: Record<string, string> };
export type UpdateCandidate = LoadedExtension & { description?: string; evidence: string };
export type MetadataProposal = LoadedExtension & { description: string };

function plainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Preserve unrelated keys verbatim; malformed metadata is never silently replaced. */
export function readMetadataDocument(path: string): MetadataDocument {
	let value: unknown;
	try {
		value = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error("metadata 文件无法读取或不是有效 JSON，未修改原文件。");
	}
	if (!plainObject(value) || (value.extensions !== undefined &&
		(!plainObject(value.extensions) || Object.values(value.extensions).some((item) => typeof item !== "string")))) {
		throw new Error("metadata 格式无效：extensions 必须是字符串描述映射，未修改原文件。");
	}
	return value as MetadataDocument;
}

export function hasDescription(data: MetadataDocument, entry: LoadedExtension): boolean {
	return [entry.name, ...entry.metadataNames].some((name) =>
		Object.hasOwn(data.extensions ?? {}, name) && Boolean(data.extensions?.[name]?.trim()));
}

export function cleanDescription(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
		.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Bounded regular-file reads: never execute package code or follow imported files. */
function readSnippet(path: string, maxBytes: number): string {
	let fd: number | undefined;
	try {
		fd = openSync(path, "r");
		if (!fstatSync(fd).isFile()) return "";
		const buffer = Buffer.alloc(maxBytes);
		return buffer.subarray(0, readSync(fd, buffer, 0, maxBytes, 0)).toString("utf8");
	} catch {
		return "";
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

function redactCommonSecrets(text: string): string {
	return text
		.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, "[REDACTED PRIVATE KEY]")
		.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]+)\b/g, "[REDACTED TOKEN]")
		.replace(/((?:api[_-]?key|token|password|secret)\s*["']?\s*[:=]\s*)["'][^"'\r\n]+["']/gi, "$1\"[REDACTED]\"");
}

export function collectCandidates(entries: LoadedExtension[], metadata: MetadataDocument): UpdateCandidate[] {
	return entries.filter((entry) => !hasDescription(metadata, entry)).map((entry) => {
		let description = "";
		const snippets: string[] = [];
		const seenRoots = new Set<string>();
		for (const path of entry.paths.slice(0, 3)) {
			const manifest = findPackageManifest(path);
			// Avoid attributing a parent workspace's description to a standalone script.
			const usableManifest = manifest && (manifest.pi || manifest.name === entry.name) ? manifest : undefined;
			description ||= cleanDescription(usableManifest?.description);
			if (description) return { ...entry, description, evidence: "" };
			const root = usableManifest?.directory ?? dirname(path);
			if (!seenRoots.has(root)) {
				seenRoots.add(root);
				for (const filename of ["README.md", "readme.md", "README.MD"]) {
					const readme = readSnippet(join(root, filename), 8000);
					if (readme) { snippets.push(`README (参考资料):\n${readme}`); break; }
				}
			}
			const source = readSnippet(path, 4000);
			if (source.trim()) snippets.push(`已加载入口源码 (参考资料):\n${source}`);
		}
		return { ...entry, description: description || undefined, evidence: redactCommonSecrets(snippets.join("\n\n").slice(0, 12000)).slice(0, 12000) };
	});
}

export function parseModelDescription(text: string): string {
	const raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
	const value: unknown = JSON.parse(raw);
	if (!plainObject(value) || typeof value.description !== "string") throw new Error("模型未返回有效 description。");
	return cleanDescription(value.description);
}

/** Call inside the host's withFileMutationQueue; re-read after all model awaits. */
export function commitDescriptions(path: string, proposals: MetadataProposal[]): number {
	const latest = readMetadataDocument(path);
	const extensions = { ...latest.extensions };
	latest.extensions = extensions;
	let written = 0;
	for (const proposal of proposals) {
		const description = cleanDescription(proposal.description);
		if (!description || hasDescription(latest, proposal)) continue;
		Object.defineProperty(extensions, proposal.name, { value: description, enumerable: true, writable: true, configurable: true });
		written++;
	}
	if (!written) return 0;
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporary, `${JSON.stringify(latest, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
		renameSync(temporary, path);
	} finally {
		try { unlinkSync(temporary); } catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return written;
}
