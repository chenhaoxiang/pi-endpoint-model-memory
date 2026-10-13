import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { endpointFor } from "../src/endpoint.js";
import { FileMemoryStore } from "../src/store.js";
import { cleanup, fixture } from "./fixtures.js";

const endpoint = (provider: string) => endpointFor({
  provider, id: "recent", api: "openai-completions", baseUrl: `https://${provider}.invalid/v1`,
})!;

test("selection publishes complete last-choice state while preserving independent endpoint history", async () => {
  const directory = await fixture("selection-store");
  try {
    const store = new FileMemoryStore(directory);
    const first = endpoint("first");
    const second = endpoint("second");
    await store.rememberSelection(first, "first-model");
    await store.rememberSelection(second, "second-model");
    const latest = await new FileMemoryStore(directory).readLastSelection();
    assert.deepEqual(latest, await store.read(second));
    assert.equal(latest?.provider, "second");
    assert.equal((await store.read(first))?.modelId, "first-model");
    await store.remember(first, "endpoint-only");
    assert.deepEqual(await store.readLastSelection(), latest);
    assert.deepEqual((await readdir(directory)).sort(), [
      `${first.key}.json`, `${second.key}.json`, "last-selection.json",
    ].sort());
    if (process.platform !== "win32") assert.equal((await stat(join(directory, "last-selection.json"))).mode & 0o777, 0o600);
  } finally { await cleanup(directory); }
});

test("forget clears the latest choice only for its matching endpoint", async () => {
  const directory = await fixture("selection-forget");
  try {
    const store = new FileMemoryStore(directory);
    const first = endpoint("first");
    const second = endpoint("second");
    await store.rememberSelection(first, "one");
    await store.rememberSelection(second, "two");
    const latest = await store.readLastSelection();
    await store.forget(first);
    assert.deepEqual(await store.readLastSelection(), latest);
    await store.forget(second);
    assert.equal(await store.readLastSelection(), undefined);
    assert.equal(await store.read(second), undefined);
    await store.forget(second);
    assert.deepEqual(await readdir(directory), []);
  } finally { await cleanup(directory); }
});

test("same-process selections serialize and cross-store races keep a complete atomic choice", async () => {
  const directory = await fixture("selection-race");
  try {
    const first = endpoint("first");
    const second = endpoint("second");
    const store = new FileMemoryStore(directory);
    await Promise.all(Array.from({ length: 15 }, (_, index) =>
      store.rememberSelection(index % 2 ? first : second, `model-${index}`)));
    assert.equal((await store.readLastSelection())?.modelId, "model-14");
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      new FileMemoryStore(directory).rememberSelection(index % 2 ? first : second, `race-${index}`)));
    const latest = (await store.readLastSelection())!;
    assert.ok([first.key, second.key].includes(latest.endpointKey));
    assert.equal(latest.provider, latest.endpointKey === first.key ? first.provider : second.provider);
    assert.match(latest.modelId, /^race-\d+$/u);
    assert.equal((await readdir(directory)).length, 3);
  } finally { await cleanup(directory); }
});

test("last-choice state validates schema and projects only permitted fields", async () => {
  const directory = await fixture("selection-validation");
  try {
    const store = new FileMemoryStore(directory);
    const first = endpoint("first");
    await store.rememberSelection(first, "model");
    const file = join(directory, "last-selection.json");
    const valid = JSON.parse(await readFile(file, "utf8"));
    for (const invalid of [
      { ...valid, version: 2 }, { ...valid, endpointKey: "../../outside" },
      { ...valid, provider: "\u001b[31m" }, { ...valid, modelId: "bad\nmodel" },
      { ...valid, updatedAt: "2026-02-30T00:00:00.000Z" }, null, [],
      "invalid JSON", "x".repeat(9000),
    ]) {
      const bytes = typeof invalid === "string" ? invalid : JSON.stringify(invalid);
      await writeFile(file, bytes);
      await assert.rejects(store.readLastSelection());
      assert.equal(await readFile(file, "utf8"), bytes);
    }
    await writeFile(file, JSON.stringify({ ...valid, apiKey: "synthetic-private-value", baseUrl: "https://private.invalid" }));
    assert.deepEqual(await store.readLastSelection(), valid);
    await store.rememberSelection(first, "repaired");
    assert.equal((await store.readLastSelection())?.modelId, "repaired");
    const bytes = await readFile(file, "utf8");
    assert.ok(!bytes.includes("synthetic-private-value") && !bytes.includes("private.invalid"));
    assert.deepEqual(Object.keys(JSON.parse(bytes)).sort(), ["version", "endpointKey", "provider", "modelId", "updatedAt"].sort());
  } finally { await cleanup(directory); }
});

test("failure publishing the last choice is reported and does not corrupt endpoint history", async () => {
  const directory = await fixture("selection-write-failure");
  try {
    const store = new FileMemoryStore(directory);
    const first = endpoint("first");
    await mkdir(join(directory, "last-selection.json"));
    await assert.rejects(store.rememberSelection(first, "model"));
    assert.equal((await store.read(first))?.modelId, "model");
    assert.deepEqual((await readdir(directory)).sort(), [`${first.key}.json`, "last-selection.json"].sort());
  } finally { await cleanup(directory); }
});
