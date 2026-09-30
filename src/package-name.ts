import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Identify a local Pi package by its manifest, never by its entry directory. */
export function localPackageName(resourcePath: string): string | undefined {
	let directory = dirname(resourcePath);
	for (let depth = 0; depth < 4; depth++) {
		try {
			const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
			// A nearest package boundary without a Pi manifest must not inherit an outer name.
			return typeof manifest.name === "string" && manifest.name.trim() && manifest.pi
				? manifest.name.trim() : undefined;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
		}
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return undefined;
}
