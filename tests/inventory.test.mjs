import assert from "node:assert/strict";
import { test } from "node:test";
import { getLoadedExtensions, installPackageListPatch, refreshLoadedResources } from "../src/host-patch.ts";

test("inventory uses active host, excludes hidden extensions and merges package entries", () => {
	class Host {
		constructor() {
			this.session = { resourceLoader: { getExtensions: () => ({ extensions: [
				{ path: "/pkg/src/index.ts", sourceInfo: { source: "npm:demo" } },
				{ path: "/pkg/second.ts", sourceInfo: { source: "npm:demo" } },
				{ path: "/local.ts" },
				{ path: "/hidden.ts", hidden: true },
			] }) } };
			this.ui = { requestRender: () => { this.rendered = true; } };
		}
		showLoadedResources() { this.shown = true; }
		getCompactPackageSourceLabel(info) { return info.source.slice(4); }
		getCompactExtensionLabels(items) { return items.map((item) => item.path === "/local.ts" ? "local.ts" : item.path.includes("src") ? "demo:src" : "demo:second.ts"); }
	}
	assert.throws(() => getLoadedExtensions(Host), /重启/);
	installPackageListPatch(Host);
	const host = new Host();
	host.showLoadedResources();
	assert.deepEqual(getLoadedExtensions(Host), [
		{ name: "demo", metadataNames: ["demo:src", "demo:second.ts"], paths: ["/pkg/src/index.ts", "/pkg/second.ts"] },
		{ name: "local", metadataNames: ["local.ts"], paths: ["/local.ts"] },
	]);
	refreshLoadedResources(Host);
	assert.equal(host.rendered, true);
});
