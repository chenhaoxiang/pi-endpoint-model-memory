import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { endpointFor, validIdentifier } from "../src/endpoint.js";
import { launchPolicy } from "../src/launch.js";
import { FileMemoryStore } from "../src/store.js";
import { fixture, cleanup } from "./fixtures.js";

const model = (overrides: Partial<{ provider: string; id: string; api: string; baseUrl: string }> = {}) => ({
  provider: "codex-local", id: "gpt-6-sol", api: "openai-responses", baseUrl: "http://127.0.0.1:8317/v1", ...overrides,
});

test("model changes share identity while ports/providers/API/path/query remain separate", () => {
  const baseline = endpointFor(model())!;
  assert.equal(baseline.key, endpointFor(model({ id: "gpt-6.1-sol" }))?.key);
  for (const changes of [
    { baseUrl: "http://127.0.0.1:8319/v1" }, { api: "openai-completions" },
    { provider: "codex-local-8319" }, { baseUrl: "https://127.0.0.1:8317/v1" },
    { baseUrl: "http://127.0.0.1:8317/V1" }, { baseUrl: "http://127.0.0.1:8317/v1?tenant=one" },
  ]) assert.notEqual(baseline.key, endpointFor(model(changes))?.key);
  assert.match(baseline.key, /^[a-f0-9]{64}$/u);
});

test("identity normalizes trailing slash, host case, default port, and fragments", () => {
  assert.equal(endpointFor(model({ baseUrl: "http://127.0.0.1:8317/v1///#fragment" }))?.key, endpointFor(model())?.key);
  assert.equal(endpointFor(model({ baseUrl: "https://EXAMPLE.invalid:443/v1/" }))?.key,
    endpointFor(model({ baseUrl: "https://example.invalid/v1" }))?.key);
});

for (const baseUrl of ["https://$API_HOST/v1", "https://${API_HOST}/v1", "ftp://host/v1", "not a URL", "http://host/v1 with spaces", "http://user:pass@host/v1", "http://host/v1\n"]) {
  test(`unsupported/unresolved URL is skipped (${JSON.stringify(baseUrl)})`, () => {
    assert.equal(endpointFor(model({ baseUrl })), undefined);
  });
}

test("identifiers are bounded and reject terminal control characters", () => {
  for (const value of ["", "x".repeat(513), "bad\nmodel", "\u001b[31m", 1, null]) assert.equal(validIdentifier(value), false);
  assert.equal(validIdentifier("provider/model:tag"), true);
});

for (const args of [["--model", "gpt-6.1-sol"], ["--models", "codex-local/*"], ["--api-key", "synthetic"], ["--unknown-extension-flag", "x"]]) {
  test(`explicit or unknown CLI selection wins (${args[0]})`, () => {
    assert.equal(launchPolicy(["node", "cli.js", ...args]).explicitSelection, true);
  });
}

for (const args of [["--continue"], ["-c"], ["--resume"], ["-r"], ["--session", "old"], ["--session-id", "old"], ["--fork", "old"]]) {
  test(`CLI session choice is preserved (${args[0]})`, () => {
    assert.equal(launchPolicy(["node", "cli.js", ...args]).sessionSelection, true);
  });
}

test("public Pi parser respects provider-only, reasoning, flag values, and prompt delimiter", () => {
  const policy = launchPolicy(["node", "cli.js", "--provider", "codex-local", "--thinking", "high"]);
  assert.equal(policy.explicitSelection, false); assert.equal(policy.explicitThinking, true);
  assert.equal(launchPolicy(["node", "cli.js", "--endpoint-model-memory", "off"]).explicitSelection, false);
  assert.equal(launchPolicy(["node", "cli.js", "--", "--model", "not-a-flag"]).explicitSelection, false);
  assert.equal(launchPolicy(["node", "cli.js", "--append-system-prompt", "--model"]).explicitSelection, false);
  assert.equal(launchPolicy(["node", "custom-sdk.ts"]).cliHost, false);
  assert.equal(launchPolicy(["pi", "pi"]).cliHost, true);
  assert.equal(launchPolicy(["node", "cli.js", "--no-session"]).ephemeral, true);
});

test("store isolates endpoints and removes only the requested record", async () => {
  const directory = await fixture("store");
  try {
    const store = new FileMemoryStore(directory);
    const first = endpointFor(model())!;
    const second = endpointFor(model({ baseUrl: "http://127.0.0.1:8319/v1" }))!;
    await Promise.all([store.remember(first, "gpt-6.1-sol"), store.remember(second, "gpt-6-sol")]);
    assert.equal((await store.read(first))?.modelId, "gpt-6.1-sol");
    assert.equal((await store.read(second))?.modelId, "gpt-6-sol");
    const files = await readdir(directory);
    assert.deepEqual(files.sort(), [`${first.key}.json`, `${second.key}.json`].sort());
    if (process.platform !== "win32") {
      for (const file of files) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
    }
    await store.forget(first); assert.equal(await store.read(first), undefined);
    assert.equal((await store.read(second))?.modelId, "gpt-6-sol");
    await store.forget(first); // missing is idempotent
  } finally { await cleanup(directory); }
});

test("store creates a private state directory and never persists URL or query credentials", async () => {
  const root = await fixture("privacy");
  const directory = join(root, "new-state");
  try {
    const store = new FileMemoryStore(directory);
    const secretUrl = "https://private.invalid/v1?token=synthetic-secret&tenant=one";
    const endpoint = endpointFor(model({ baseUrl: secretUrl }))!;
    await store.remember(endpoint, "model");
    const content = await readFile(join(directory, `${endpoint.key}.json`), "utf8");
    assert.ok(!content.includes("private.invalid") && !content.includes("synthetic-secret"));
    assert.deepEqual(Object.keys(JSON.parse(content)).sort(), ["version", "endpointKey", "provider", "modelId", "updatedAt"].sort());
    if (process.platform !== "win32") assert.equal((await stat(directory)).mode & 0o777, 0o700);
  } finally { await cleanup(root); }
});

test("same-process writes serialize; independent stores safely race without losing other endpoints", async () => {
  const directory = await fixture("concurrency");
  try {
    const endpoint = endpointFor(model())!;
    const other = endpointFor(model({ provider: "another" }))!;
    const store = new FileMemoryStore(directory);
    await Promise.all(Array.from({ length: 15 }, (_, index) => store.remember(endpoint, `model-${index}`)));
    assert.equal((await store.read(endpoint))?.modelId, "model-14");
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      new FileMemoryStore(directory).remember(index % 2 ? endpoint : other, `race-${index}`)));
    assert.match((await store.read(endpoint))!.modelId, /^race-\d+$/u);
    assert.match((await store.read(other))!.modelId, /^race-\d+$/u);
    assert.equal((await readdir(directory)).length, 2); // no temporary-file residue
  } finally { await cleanup(directory); }
});

test("store validates version, ownership, identifier, timestamp, size, and preserves corrupt bytes", async () => {
  const directory = await fixture("corrupt");
  try {
    const store = new FileMemoryStore(directory);
    const endpoint = endpointFor(model())!;
    await store.remember(endpoint, "gpt-6-sol");
    const path = join(directory, `${endpoint.key}.json`);
    const original = JSON.parse(await readFile(path, "utf8"));
    const invalid = [
      { ...original, version: 2 }, { ...original, endpointKey: "0".repeat(64) },
      { ...original, provider: "other" }, { ...original, modelId: "\u001b" },
      { ...original, updatedAt: "not-a-date" }, { ...original, updatedAt: "2026-02-30T00:00:00.000Z" },
      null, [], "not-json", "x".repeat(9000),
    ];
    for (const value of invalid) {
      const bytes = typeof value === "string" ? value : JSON.stringify(value);
      await writeFile(path, bytes);
      await assert.rejects(store.read(endpoint));
      assert.equal(await readFile(path, "utf8"), bytes);
    }
    await store.remember(endpoint, "valid-new-choice");
    assert.equal((await store.read(endpoint))?.modelId, "valid-new-choice");
  } finally { await cleanup(directory); }
});

test("bad endpoint identities cannot escape the state directory", async () => {
  const directory = await fixture("path");
  try {
    const store = new FileMemoryStore(directory);
    await assert.rejects(store.read({ key: "../../outside", provider: "provider" }));
    assert.throws(() => store.remember({ key: "../../outside", provider: "provider" }, "model"));
    const endpoint = endpointFor(model())!;
    await assert.rejects(store.remember(endpoint, "bad\nmodel"));
    assert.deepEqual(await readdir(directory), []);
  } finally { await cleanup(directory); }
});
