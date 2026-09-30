import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFileMetadataStore, WELCOME_METADATA_FILENAME } from "../src/list.ts";
import { getLoadedExtensions, installPackageListPatch, refreshLoadedResources } from "../src/host-patch.ts";
import { registerUpdateCommand } from "../src/update-command.ts";

export default async function packageListExtension(pi: ExtensionAPI) {
	const { InteractiveMode, getAgentDir, withFileMutationQueue } = await import("@earendil-works/pi-coding-agent");
	const metadataPath = join(getAgentDir(), WELCOME_METADATA_FILENAME);
	const store = createFileMetadataStore(metadataPath);
	installPackageListPatch(InteractiveMode, store);
	registerUpdateCommand(pi, {
		metadataPath,
		getExtensions: () => getLoadedExtensions(InteractiveMode),
		refresh: () => refreshLoadedResources(InteractiveMode),
		withFileMutationQueue,
	});
	if (typeof InteractiveMode.prototype.showLoadedResources !== "function") {
		pi.on("session_start", (_event, ctx) => {
			if (ctx.mode === "tui") {
				ctx.ui.notify("pi-package-list: unsupported Pi API; startup list was left unchanged.", "warning");
			}
		});
	}
}
