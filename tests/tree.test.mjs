import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryMetadataStore, groupedSectionToList } from "../src/list.ts";

test("tree preserves branch continuations, last children and aligned metadata", () => {
	const store = createMemoryMetadataStore({ extensions: { a: "短说明", longer: "长说明" } });
	assert.equal(groupedSectionToList("[Extensions]\n  entries", [{
		scope: "user", paths: ["longer", "a"], packages: [["npm:demo", ["demo:src"], "demo"]],
	}], store), [
		"[Extensions]",
		"└── user",
		"    ├── local",
		"    │   ├── a       短说明",
		"    │   └── longer  长说明",
		"    └── npm",
		"        └── demo",
	].join("\n"));
});

test("empty scopes are omitted without dangling vertical lines", () => {
	assert.equal(groupedSectionToList("[Extensions]\n  entries", [
		{ scope: "project", paths: ["a"], packages: [] },
		{ scope: "user", paths: [], packages: [] },
	]), "[Extensions]\n└── project\n    └── local\n        └── a");
});

test("tree respects CRLF and retains fallback for absent groups", () => {
	assert.equal(groupedSectionToList("[Extensions]\r\n  a", [{ scope: "user", paths: ["a"], packages: [] }]),
		"[Extensions]\r\n└── user\r\n    └── local\r\n        └── a");
	assert.equal(groupedSectionToList("[Extensions]\n  a, b", []), "[Extensions]\n  - a\n  - b");
});
