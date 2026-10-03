import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	compactBodyToList,
	createFileMetadataStore,
	createMemoryMetadataStore,
	expandedBodyToList,
	sectionToList,
	serializeWelcomeMetadata,
	stripAnsi,
	displayWidth,
	MAX_DESCRIPTION_WIDTH,
	truncateDescription,
} from "../src/list.ts";

test("compact comma list becomes bullets", () => {
	assert.equal(
		compactBodyToList("  council-mode, i-have-adhd, pi-subagents"),
		"  - council-mode\n  - i-have-adhd\n  - pi-subagents",
	);
});

test("compact single item still gets a bullet", () => {
	assert.equal(compactBodyToList("  agent/AGENTS.md"), "  - agent/AGENTS.md");
});

test("compact is idempotent", () => {
	const once = compactBodyToList("  a, b");
	assert.equal(compactBodyToList(once), once);
});

test("compact preserves wrapping ansi", () => {
	const dim = "\x1b[2m  a, b\x1b[22m";
	assert.equal(compactBodyToList(dim), "\x1b[2m  - a\x1b[22m\n\x1b[2m  - b\x1b[22m");
});

test("section compact keeps header", () => {
	const out = sectionToList("[Skills]\n  council-mode, pi-subagents", "compact");
	assert.equal(out, "[Skills]\n  - council-mode\n  - pi-subagents");
});

test("expanded bullets leaves and keeps group labels", () => {
	const input = [
		"  user",
		"    ~/.pi/agent/skills/council-mode/SKILL.md",
		"    npm:pi-subagents",
		"      skills/pi-subagents",
	].join("\n");
	const out = expandedBodyToList(input);
	assert.equal(
		out,
		[
			"  user",
			"    - ~/.pi/agent/skills/council-mode/SKILL.md",
			"    npm:pi-subagents",
			"      - skills/pi-subagents",
		].join("\n"),
	);
});

test("expanded context files at indent 2 get bullets", () => {
	assert.equal(expandedBodyToList("  agent/AGENTS.md"), "  - agent/AGENTS.md");
});

test("stripAnsi used by transforms", () => {
	assert.equal(stripAnsi("\x1b[2mhi\x1b[22m"), "hi");
});

test("installPackageListPatch wraps expandable collapsed text", async () => {
	const { installPackageListPatch } = await import("../src/host-patch.ts");
	const children = [];
	const container = {
		addChild(child) {
			children.push(child);
			return child;
		},
	};
	function InteractiveMode() {}
	InteractiveMode.prototype.showLoadedResources = function () {
		this.loadedResourcesContainer.addChild({
			getCollapsedText: () => "[Skills]\n  council-mode, pi-subagents",
			getExpandedText: () => "[Skills]\n  user\n    skill.md",
			setExpanded(expanded) {
				this.text = expanded ? this.getExpandedText() : this.getCollapsedText();
			},
		});
		this.loadedResourcesContainer.addChild({ spacer: true });
	};
	InteractiveMode.prototype.getStartupExpansionState = () => false;
	assert.equal(installPackageListPatch(InteractiveMode), true);
	assert.equal(installPackageListPatch(InteractiveMode), false);
	const im = new InteractiveMode();
	im.loadedResourcesContainer = container;
	im.showLoadedResources();
	assert.equal(children[0].text, "[Skills]\n  - council-mode\n  - pi-subagents");
	assert.equal(children[0].getExpandedText(), "[Skills]\n  user\n    - skill.md");
	assert.equal(children[1].spacer, true);
});

test("short descriptions are kept intact", () => {
	assert.equal(truncateDescription("模糊文件/内容搜索"), "模糊文件/内容搜索");
	const exact = "a".repeat(MAX_DESCRIPTION_WIDTH);
	assert.equal(truncateDescription(exact), exact);
});

test("long ascii description is truncated to the column limit", () => {
	const out = truncateDescription(
		"herdr integration for the pi coding agent — spawn, drive, wait for, and harvest AI agent panes",
	);
	assert.equal(out, "herdr integration for the pi coding age…");
	assert.equal(displayWidth(out), MAX_DESCRIPTION_WIDTH);
});

test("cjk truncation counts two columns per character", () => {
	const out = truncateDescription("中".repeat(30));
	assert.equal(out, `${"中".repeat(19)}…`);
	assert.ok(displayWidth(out) <= MAX_DESCRIPTION_WIDTH);
});

test("multi-line descriptions collapse to one line", () => {
	assert.equal(truncateDescription("Sync Pi config,\n  with adapters"), "Sync Pi config, with adapters");
});

test("truncation is display-only and keeps stored metadata", () => {
	const full = "Sync Pi configuration across machines via a private Git repository";
	const store = createMemoryMetadataStore({ extensions: { "pi-sync": full } });
	const out = compactBodyToList("  pi-sync", { section: "extensions", store });
	assert.equal(out, "  - pi-sync  Sync Pi configuration across machines v…");
	assert.equal(store.data.extensions["pi-sync"], full);
});

test("compact aligns descriptions from metadata", () => {
	const store = createMemoryMetadataStore({
		skills: {
			a: "短",
			"long-name": "长说明",
		},
	});
	assert.equal(
		compactBodyToList("  a, skipped, long-name", {
			section: "skills",
			store,
		}),
		[
			"  - a          短",
			"  - skipped",
			"  - long-name  长说明",
		].join("\n"),
	);
});

test("compact registers unknown names without overwriting descriptions", () => {
	const store = createMemoryMetadataStore({
		skills: { "council-mode": "顾问委员会" },
	});
	compactBodyToList("  council-mode, new-skill", { section: "skills", store });
	assert.equal(store.data.skills["council-mode"], "顾问委员会");
	assert.equal(store.data.skills["new-skill"], "");
});

test("sectionToList uses header to look up metadata", () => {
	const store = createMemoryMetadataStore({
		context: { "agent/AGENTS.md": "全局工作纪律" },
	});
	assert.equal(
		sectionToList("[Context]\n  agent/AGENTS.md", "compact", { store }),
		"[Context]\n  - agent/AGENTS.md  全局工作纪律",
	);
});

test("file store appends new names and keeps existing notes", () => {
	const dir = mkdtempSync(join(tmpdir(), "welcome-metadata-"));
	const filePath = join(dir, "welcome-metadata.json");
	writeFileSync(
		filePath,
		serializeWelcomeMetadata({ skills: { "council-mode": "顾问委员会" } }),
	);
	const store = createFileMetadataStore(filePath);
	compactBodyToList("  council-mode, brand-new", { section: "skills", store });
	const saved = JSON.parse(readFileSync(filePath, "utf8"));
	assert.equal(saved.skills["council-mode"], "顾问委员会");
	assert.equal(saved.skills["brand-new"], "");
});

test("installPackageListPatch annotates from store", async () => {
	const { installPackageListPatch } = await import("../src/host-patch.ts");
	const store = createMemoryMetadataStore({
		skills: { "council-mode": "顾问委员会" },
	});
	const children = [];
	const container = {
		addChild(child) {
			children.push(child);
			return child;
		},
	};
	function InteractiveMode() {}
	InteractiveMode.prototype.showLoadedResources = function () {
		this.loadedResourcesContainer.addChild({
			getCollapsedText: () => "[Skills]\n  council-mode, extra",
			setExpanded(expanded) {
				this.text = this.getCollapsedText();
				this.expanded = expanded;
			},
		});
	};
	InteractiveMode.prototype.getStartupExpansionState = () => false;
	assert.equal(installPackageListPatch(InteractiveMode, store), true);
	const im = new InteractiveMode();
	im.loadedResourcesContainer = container;
	im.showLoadedResources();
	assert.equal(
		children[0].text,
		"[Skills]\n  - council-mode  顾问委员会\n  - extra",
	);
	assert.equal(store.data.skills.extra, "");
});

test("installPackageListPatch hides Themes and its spacer", async () => {
	const { installPackageListPatch } = await import("../src/host-patch.ts");
	const store = createMemoryMetadataStore();
	const children = [];
	const container = {
		addChild(child) {
			children.push(child);
			return child;
		},
	};
	function InteractiveMode() {}
	InteractiveMode.prototype.showLoadedResources = function () {
		this.loadedResourcesContainer.addChild({
			getCollapsedText: () => "[Skills]\n  council-mode",
			setExpanded() {
				this.text = this.getCollapsedText();
			},
		});
		this.loadedResourcesContainer.addChild({ spacer: true, id: "after-skills" });
		this.loadedResourcesContainer.addChild({
			getCollapsedText: () => "[Themes]\n  dark-arctic, light-sakura",
			setExpanded() {
				this.text = this.getCollapsedText();
			},
		});
		this.loadedResourcesContainer.addChild({ spacer: true, id: "after-themes" });
	};
	InteractiveMode.prototype.getStartupExpansionState = () => false;
	assert.equal(installPackageListPatch(InteractiveMode, store), true);
	const im = new InteractiveMode();
	im.loadedResourcesContainer = container;
	im.showLoadedResources();
	assert.equal(children.length, 2);
	assert.equal(children[0].text, "[Skills]\n  - council-mode");
	assert.equal(children[1].id, "after-skills");
	assert.equal(store.data.themes["dark-arctic"], undefined);
});
