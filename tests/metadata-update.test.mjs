import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectCandidates, commitDescriptions, readMetadataDocument, parseModelDescription } from "../src/metadata-update.ts";
import { registerUpdateCommand } from "../src/update-command.ts";

function fixture(description) {
	const root = mkdtempSync(join(tmpdir(), "pi-update-"));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo", pi: { extensions: ["src/index.ts"] }, description }));
	writeFileSync(join(root, "README.md"), "A Pi search extension.");
	writeFileSync(join(root, "src/index.ts"), 'const apiKey = "secret-example"; // search');
	return { root, file: join(root, "metadata.json"), entry: { name: "demo", metadataNames: ["demo:src"], paths: [join(root, "src/index.ts")] } };
}

test("manifest first, missing descriptions get bounded redacted evidence", () => {
	const { entry } = fixture("Package search");
	const [candidate] = collectCandidates([entry], {});
	assert.equal(candidate.description, "Package search");
	assert.equal(candidate.evidence, "");
	const fallback = collectCandidates([fixture().entry], {})[0];
	assert.match(fallback.evidence, /A Pi search/);
	assert.doesNotMatch(fallback.evidence, /secret-example/);
	assert.ok(fallback.evidence.length <= 12000);
	assert.equal(collectCandidates([entry], { extensions: { "demo:src": "手写" } }).length, 0);
});

test("commit only fills empty keys, rechecks aliases and preserves other data", () => {
	const { file, entry } = fixture();
	writeFileSync(file, JSON.stringify({ extensions: { "demo:src": "并发手写" }, skills: { s: "说明" }, extra: { keep: true } }));
	assert.equal(commitDescriptions(file, [{ ...entry, description: "自动" }]), 0);
	const data = readMetadataDocument(file);
	data.extensions["demo:src"] = "";
	writeFileSync(file, JSON.stringify(data));
	assert.equal(commitDescriptions(file, [{ ...entry, description: "自动" }]), 1);
	assert.deepEqual(readMetadataDocument(file), { extensions: { "demo:src": "", demo: "自动" }, skills: { s: "说明" }, extra: { keep: true } });
	assert.equal(commitDescriptions(file, [{ ...entry, description: "覆盖" }]), 0);
});

test("invalid metadata fails without modifying original bytes", () => {
	const { file, entry } = fixture();
	for (const value of ["{", "[]", '{"extensions":{"demo":3}}']) {
		writeFileSync(file, value);
		assert.throws(() => commitDescriptions(file, [{ ...entry, description: "new" }]));
		assert.equal(readFileSync(file, "utf8"), value);
	}
});

test("model output must be JSON and descriptions are sanitized", () => {
	assert.equal(parseModelDescription('```json\n{"description":"搜索\\n工具"}\n```'), "搜索 工具");
	assert.throws(() => parseModelDescription("run a command"));
	assert.throws(() => parseModelDescription('{"description":null}'));
	assert.equal(parseModelDescription('{"description":""}'), "");
});

function commandHarness(f, { approve = true, model = true, response, getResult } = {}) {
	let command;
	let requests = 0, refreshed = 0, confirmed = 0;
	const events = {}, messages = [];
	registerUpdateCommand({
		on(name, fn) { events[name] = fn; },
		registerCommand(name, value) { assert.equal(name, "pi-package-list"); command = value; },
		appendEntry() {},
	}, {
		metadataPath: f.file, getExtensions: () => [f.entry], refresh() { refreshed++; },
		withFileMutationQueue: async (_path, fn) => fn(),
	});
	const ctx = {
		mode: "tui", model: model ? { id: "current", provider: "test" } : undefined,
		ui: { notify(text) { messages.push(text); }, setStatus() {}, async confirm() { confirmed++; return approve; } },
		modelRegistry: { streamSimple(selected, context, options) {
			requests++;
			assert.equal(selected.id, "current");
			assert.deepEqual(context.tools, []);
			assert.equal(context.messages.length, 1);
			assert.doesNotMatch(context.messages[0].content[0].text, /secret-example/);
			assert.ok(options.signal);
			return { result: getResult ?? (async () => response ?? { stopReason: "stop", content: [{ type: "text", text: '{"description":"搜索文件"}' }], usage: {} }) };
		} },
	};
	return { run: (args = "update") => command.handler(args, ctx), ctx, events, messages, requests: () => requests, refreshed: () => refreshed, confirmed: () => confirmed };
}

test("command uses manifest without a model call and refreshes UI", async () => {
	const f = fixture("Description from package");
	const h = commandHarness(f);
	await h.run();
	assert.equal(readMetadataDocument(f.file).extensions.demo, "Description from package");
	assert.equal(h.requests(), 0);
	assert.equal(h.confirmed(), 0);
	assert.equal(h.refreshed(), 1);
});

test("command summarizes with current model and never overwrites on subsequent runs", async () => {
	const f = fixture();
	const h = commandHarness(f);
	await h.run();
	assert.equal(readMetadataDocument(f.file).extensions.demo, "搜索文件");
	await h.run();
	assert.equal(h.requests(), 1);
	assert.equal(h.confirmed(), 1);
});

test("declined consent, missing model and malformed response leave metadata unchanged", async () => {
	for (const options of [{ approve: false }, { model: false }, { response: { stopReason: "stop", content: [{ type: "text", text: "invalid" }] } }]) {
		const f = fixture();
		const h = commandHarness(f, options);
		await h.run();
		assert.deepEqual(readMetadataDocument(f.file), {});
		assert.equal(h.refreshed(), 0);
	}
});

test("existing legacy metadata avoids all requests", async () => {
	const f = fixture();
	writeFileSync(f.file, '{"extensions":{"demo:src":"旧说明"}}');
	const h = commandHarness(f);
	await h.run();
	assert.equal(h.requests(), 0);
	assert.equal(readMetadataDocument(f.file).extensions["demo:src"], "旧说明");
});

test("shutdown cancels in-flight requests without writing; concurrent update is rejected", async () => {
	const f = fixture();
	const h = commandHarness(f, { getResult: () => new Promise(() => {}) });
	const running = h.run();
	await new Promise((resolve) => setImmediate(resolve));
	await h.run();
	assert.ok(h.messages.some((message) => message.includes("已在运行")));
	h.events.session_shutdown();
	await running;
	assert.deepEqual(readMetadataDocument(f.file), {});
	assert.ok(h.messages.some((message) => message.includes("已取消")));
});

test("manual edits made during model requests win over generated descriptions", async () => {
	const f = fixture();
	const h = commandHarness(f, { getResult: async () => {
		writeFileSync(f.file, '{"extensions":{"demo:src":"刚写的描述"}}');
		return { stopReason: "stop", content: [{ type: "text", text: '{"description":"模型描述"}' }], usage: {} };
	} });
	await h.run();
	assert.deepEqual(readMetadataDocument(f.file).extensions, { "demo:src": "刚写的描述" });
});

test("tool requests and incomplete model replies are rejected", async () => {
	for (const response of [
		{ stopReason: "length", content: [{ type: "text", text: '{"description":"截断"}' }] },
		{ stopReason: "stop", content: [{ type: "toolCall", name: "bash" }] },
	]) {
		const f = fixture();
		const h = commandHarness(f, { response });
		await h.run();
		assert.deepEqual(readMetadataDocument(f.file), {});
	}
});

test("unknown subcommands and non-TUI mode never update", async () => {
	const f = fixture("Description");
	const h = commandHarness(f);
	await h.run("wrong");
	h.ctx.mode = "rpc";
	await h.run();
	assert.deepEqual(readMetadataDocument(f.file), {});
});
