import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryMetadataStore, groupedSectionToList, stripAnsi } from "../src/list.ts";
import { installPackageListPatch } from "../src/host-patch.ts";

const groups = [{ scope: "user", paths: ["local"], packages: [["npm:demo", ["demo:src"]]] }];

test("default grouped view preserves compact names, metadata and ANSI", () => {
	const store = createMemoryMetadataStore({ extensions: { local: "本地插件", "demo:src": "包插件" } });
	const result = groupedSectionToList("[Extensions]\n\x1b[2m  demo:src, local\x1b[22m", groups, store);
	assert.equal(stripAnsi(result), "[Extensions]\n  user\n    local\n      - local  本地插件\n    npm\n      - demo  包插件");
	assert.match(result, /\x1b\[2m/);
	assert.equal(store.data.extensions.local, "本地插件");
});

test("project/user/path order and npm/git groups follow host metadata", () => {
	assert.equal(groupedSectionToList("[Skills]\n  a, b, c", [
		{ scope: "project", paths: ["a"], packages: [] },
		{ scope: "user", paths: [], packages: [["npm:b", ["b"]], ["git:c", ["c"]]] },
		{ scope: "path", paths: ["d"], packages: [] },
	]), "[Skills]\n  project\n    local\n      - a\n  user\n    npm\n      - b\n    git\n      - c\n  path\n    local\n      - d");
});

function fixture() {
	class Host {
		constructor() {
			this.loadedResourcesContainer = { children: [], addChild(child) { this.children.push(child); } };
			this.session = {
				resourceLoader: { getSkills: () => ({ skills: [{ filePath: "/skill/SKILL.md", name: "real-skill-name" }] }) },
				promptTemplates: [{ filePath: "/prompt.md", name: "review" }],
			};
		}
		buildScopeGroups(items) { return [{ scope: "user", paths: items, packages: new Map() }]; }
		getCompactExtensionLabels(items) { return items.map((_, i) => ["local", "demo:src"][i]); }
		getStartupExpansionState() { return false; }
		showLoadedResources() {
			const add = (header, names, paths) => {
				const state = { expanded: false };
				this.loadedResourcesContainer.addChild({ state,
					build: () => `[${header}]\n${state.expanded ? paths : `  ${names}`}`,
					setExpanded(value) { state.expanded = value; }, invalidate() {},
				});
			};
			this.buildScopeGroups([{ path: "/skill/SKILL.md" }]);
			add("Skills", "real-skill-name", "  user\n    /skill/SKILL.md");
			this.buildScopeGroups([{ path: "/prompt.md" }]);
			add("Prompts", "/review", "  user\n    /review");
			const extensions = [{ path: "/local.ts" }, { path: "/pkg/index.ts" }];
			this.buildScopeGroups(extensions);
			this.getCompactExtensionLabels(extensions);
			add("Extensions", "local, demo:src", "  user\n    /local.ts\n    /pkg/index.ts");
		}
	}
	return Host;
}

test("host captures groups by section, keeps metadata and supports Ctrl+O", () => {
	const Host = fixture();
	const originalGroups = Host.prototype.buildScopeGroups;
	const originalLabels = Host.prototype.getCompactExtensionLabels;
	const store = createMemoryMetadataStore({ extensions: { local: "描述" } });
	installPackageListPatch(Host, store);
	const mode = new Host();
	mode.showLoadedResources();
	const [skill, prompt, extension] = mode.loadedResourcesContainer.children;
	assert.equal(skill.build(), "[Skills]\n  user\n    local\n      - real-skill-name");
	assert.equal(prompt.build(), "[Prompts]\n  user\n    local\n      - /review");
	assert.match(extension.build(), /user\n/);
	assert.match(extension.build(), /      - local  描述/);
	assert.match(extension.build(), /- demo:src/);
	assert.doesNotMatch(extension.build(), /\/local.ts/);
	extension.setExpanded(true);
	assert.match(extension.build(), /- \/local.ts/);
	extension.setExpanded(false);
	assert.match(extension.build(), /- local  描述/);
	assert.equal(mode.buildScopeGroups, originalGroups);
	assert.equal(mode.getCompactExtensionLabels, originalLabels);
	assert.equal(Object.hasOwn(mode, "buildScopeGroups"), false);
	assert.equal(Object.hasOwn(mode, "getCompactExtensionLabels"), false);
});

test("temporary source hooks are restored when host throws", () => {
	const Host = fixture();
	Host.prototype.showLoadedResources = function () { throw new Error("failure"); };
	installPackageListPatch(Host);
	const mode = new Host();
	assert.throws(() => mode.showLoadedResources(), /failure/);
	assert.equal(Object.hasOwn(mode, "buildScopeGroups"), false);
	assert.equal(Object.hasOwn(mode, "getCompactExtensionLabels"), false);
});
