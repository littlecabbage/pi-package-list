import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFileMetadataStore, WELCOME_METADATA_FILENAME } from "../src/list.ts";
import { installPackageListPatch } from "../src/host-patch.ts";

export default async function packageListExtension(pi: ExtensionAPI) {
	const { InteractiveMode, getAgentDir } = await import("@earendil-works/pi-coding-agent");
	const store = createFileMetadataStore(join(getAgentDir(), WELCOME_METADATA_FILENAME));
	installPackageListPatch(InteractiveMode, store);
	if (typeof InteractiveMode.prototype.showLoadedResources !== "function") {
		pi.on("session_start", (_event, ctx) => {
			if (ctx.mode === "tui") {
				ctx.ui.notify("pi-package-list: unsupported Pi API; startup list was left unchanged.", "warning");
			}
		});
	}
}
