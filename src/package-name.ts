import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PackageManifest = {
	directory: string;
	name?: string;
	description?: string;
	pi?: unknown;
};

/** Stop at the nearest package boundary; never inherit an outer package. */
export function findPackageManifest(resourcePath: string): PackageManifest | undefined {
	let directory = dirname(resourcePath);
	for (let depth = 0; depth < 4; depth++) {
		try {
			const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
			if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return undefined;
			return {
				directory,
				name: typeof manifest.name === "string" ? manifest.name.trim() : undefined,
				description: typeof manifest.description === "string" ? manifest.description : undefined,
				pi: manifest.pi,
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
		}
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return undefined;
}

/** Identify a local Pi package by its manifest, never by its entry directory. */
export function localPackageName(resourcePath: string): string | undefined {
	const manifest = findPackageManifest(resourcePath);
	return manifest?.pi && manifest.name ? manifest.name : undefined;
}
