import assert from "node:assert/strict";
import { test } from "node:test";
import { installPackageListPatch } from "../src/host-patch.ts";
import { createMemoryMetadataStore } from "../src/list.ts";

// Matches Pi 0.99.1: factories are captured by build, not getter methods.
class ExpandableText {
	constructor(collapsed, expanded, open = false) {
		const state = { expanded: open };
		this.state = state;
		this.build = () => state.expanded ? expanded() : collapsed();
	}
	invalidate() { this.invalidated = true; }
	setExpanded(value) { this.state.expanded = value; this.invalidate(); }
}

function host(sections) {
	class InteractiveMode {
		loadedResourcesContainer = {
			children: [],
			addChild(child) { this.children.push(child); return child; },
		};
		getStartupExpansionState() { return false; }
		showLoadedResources() {
			this.loadedResourcesContainer.children = [];
			for (const section of sections()) {
				this.loadedResourcesContainer.addChild(section);
				this.loadedResourcesContainer.addChild({ spacer: true });
			}
		}
	}
	return InteractiveMode;
}

test("closure-based host supports metadata, expansion, theme refresh and reload", () => {
	let color = "\x1b[2m";
	const store = createMemoryMetadataStore({ extensions: { demo: "说明" } });
	const Host = host(() => [new ExpandableText(
		() => `${color}[Extensions]\n  demo, extra\x1b[0m`,
		() => `${color}[Extensions]\n  user\n    demo.ts\x1b[0m`,
	)]);
	assert.equal(installPackageListPatch(Host, store), true);
	assert.equal(installPackageListPatch(Host, store), false);
	const mode = new Host();
	const originalAdd = mode.loadedResourcesContainer.addChild;
	mode.showLoadedResources();
	assert.equal(mode.loadedResourcesContainer.addChild, originalAdd);
	let child = mode.loadedResourcesContainer.children[0];
	assert.match(child.build(), /- demo  说明/);
	assert.match(child.build(), /\n.*- extra/);
	child.setExpanded(true);
	assert.match(child.build(), /user\n.*- demo.ts/);
	child.setExpanded(false);
	color = "\x1b[36m";
	child.invalidate();
	assert.match(child.build(), /^\x1b\[36m/);
	assert.match(child.build(), /- demo  说明/);
	mode.showLoadedResources();
	child = mode.loadedResourcesContainer.children[0];
	assert.match(child.build(), /- demo  说明/);
});

test("new host hides themes and leaves diagnostics untouched", () => {
	const diagnostic = { build: () => "[Extension issues]\n  warning" };
	const Host = host(() => [
		new ExpandableText(() => "[Themes]\n  dark", () => "[Themes]\n  user\n    dark"),
		diagnostic,
	]);
	installPackageListPatch(Host);
	const mode = new Host();
	mode.showLoadedResources();
	assert.equal(mode.loadedResourcesContainer.children.length, 2);
	assert.equal(mode.loadedResourcesContainer.children[0], diagnostic);
	assert.equal(diagnostic.build(), "[Extension issues]\n  warning");
});

test("restores addChild if host rendering throws", () => {
	class Host {
		showLoadedResources() { throw new Error("host failure"); }
	}
	installPackageListPatch(Host);
	const mode = new Host();
	const addChild = () => {};
	mode.loadedResourcesContainer = { addChild };
	assert.throws(() => mode.showLoadedResources(), /host failure/);
	assert.equal(mode.loadedResourcesContainer.addChild, addChild);
});

test("unsupported host is not modified", () => {
	class Host {}
	assert.equal(installPackageListPatch(Host), false);
	assert.equal(Host.prototype.showLoadedResources, undefined);
});
