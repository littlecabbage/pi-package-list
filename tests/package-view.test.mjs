import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createMemoryMetadataStore, groupedSectionToList } from "../src/list.ts";
import { localPackageName } from "../src/package-name.ts";

test("npm package entries collapse to one name and retain all legacy descriptions", () => {
	const store = createMemoryMetadataStore({ extensions: { "@demo/pkg:src": "搜索", "@demo/pkg:other": "导航" } });
	const result = groupedSectionToList("[Extensions]\n  entries", [{ scope: "user", paths: [], packages: [
		["npm:@demo/pkg", ["@demo/pkg:src", "@demo/pkg:other"], "@demo/pkg"],
	] }], store);
	assert.equal(result, "[Extensions]\n  user\n    npm\n      - @demo/pkg  搜索 / 导航");
	assert.doesNotMatch(result, /:src|:other|npm:@/);
	assert.equal(store.data.extensions["@demo/pkg:src"], "搜索");
});

test("canonical package metadata overrides legacy aliases, duplicate notes are deduplicated", () => {
	const store = createMemoryMetadataStore({ extensions: { demo: "总说明", "demo:src": "旧说明" } });
	const groups = [{ scope: "user", paths: [], packages: [["npm:demo", ["demo:src"], "demo"]] }];
	assert.match(groupedSectionToList("[Extensions]\n  entries", groups, store), /- demo  总说明/);
	store.data.extensions.demo = "";
	store.data.extensions["demo:second"] = "旧说明";
	groups[0].packages[0][1].push("demo:second");
	assert.match(groupedSectionToList("[Extensions]\n  entries", groups, store), /- demo  旧说明$/);
});

test("git packages and local multi-entry packages show one row, with alias metadata", () => {
	const store = createMemoryMetadataStore({ extensions: { extensions: "列表增强" } });
	assert.equal(groupedSectionToList("[Extensions]\n  entries", [{ scope: "project", paths: [
		{ name: "pi-package-list", metadataNames: ["extensions"] },
		{ name: "pi-package-list", metadataNames: ["other-entry"] },
	], packages: [["git:github.com/test/demo@v1", ["demo:src"], "test/demo"]] }], store),
	"[Extensions]\n  project\n    local\n      - pi-package-list  列表增强\n    git\n      - test/demo");
});

test("local package name uses a Pi manifest, respects package boundaries and invalid JSON", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-package-name-"));
	mkdirSync(join(dir, "src"));
	writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "pi-test", pi: { extensions: ["src/index.ts"] } }));
	assert.equal(localPackageName(join(dir, "src/index.ts")), "pi-test");
	writeFileSync(join(dir, "src/package.json"), JSON.stringify({ name: "not-a-pi-package" }));
	assert.equal(localPackageName(join(dir, "src/index.ts")), undefined);
	writeFileSync(join(dir, "src/package.json"), "{");
	assert.equal(localPackageName(join(dir, "src/index.ts")), undefined);
});
