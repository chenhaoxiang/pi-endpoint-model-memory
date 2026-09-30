import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { endpointFor } from "../src/endpoint.js";
import { registerModelMemory } from "../src/controller.js";
import type { LaunchPolicy } from "../src/launch.js";
import type { MemoryRecord, MemoryStore } from "../src/store.js";

const base = "http://127.0.0.1:8317/v1";
const fakeModel = (provider = "codex-local", id = "gpt-6-sol", baseUrl = base) =>
  ({ provider, id, api: "openai-responses", baseUrl });
const defaultLaunch: LaunchPolicy = {
  cliHost: true, explicitSelection: false, sessionSelection: false, explicitThinking: false, ephemeral: false,
};

class MemoryStoreStub implements MemoryStore {
  records = new Map<string, MemoryRecord>();
  reads = 0;
  writes = 0;
  forgotten = 0;
  failRead = false;
  failWrite = false;
  async read(endpoint: { key: string; provider: string }) {
    this.reads++;
    if (this.failRead) throw new Error("private URL and credentials must never reach notifications");
    return this.records.get(endpoint.key);
  }
  async remember(endpoint: { key: string; provider: string }, modelId: string) {
    this.writes++;
    if (this.failWrite) throw new Error("private state must never reach notifications");
    this.records.set(endpoint.key, {
      version: 1, endpointKey: endpoint.key, provider: endpoint.provider, modelId, updatedAt: "2026-09-30T00:00:00.000Z",
    });
  }
  async forget(endpoint: { key: string }) { this.forgotten++; this.records.delete(endpoint.key); }
}

function harness(launch: Partial<LaunchPolicy> = {}) {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<void>>();
  const commands = new Map<string, any>();
  const flags = new Map<string, string | boolean>();
  const store = new MemoryStoreStub();
  const original = fakeModel();
  const candidate = fakeModel(original.provider, "gpt-6.1-sol");
  const models = new Map<string, any>([[original.id, original], [candidate.id, candidate]]);
  const notices: { message: string; type: string }[] = [];
  const state = { auth: true, selection: true, selectionError: false, selected: 0, confirm: true, thinking: "max" };
  const ctx: any = {
    mode: "tui", model: original, scopedModels: [],
    sessionManager: { getBranch: () => [] },
    modelRegistry: { find: (_provider: string, id: string) => models.get(id), hasConfiguredAuth: () => state.auth },
    ui: { notify: (message: string, type: string) => notices.push({ message, type }), confirm: async () => state.confirm },
  };
  const pi: any = {
    on(name: string, handler: any) { handlers.set(name, handler); return () => {}; },
    registerFlag(name: string, options: any) { flags.set(name, options.default); },
    getFlag(name: string) { return flags.get(name); },
    registerCommand(name: string, options: any) { commands.set(name, options); },
    getThinkingLevel() { return state.thinking; },
    setThinkingLevel(level: string) { state.thinking = level; },
    async setModel(model: any) {
      state.selected++;
      if (state.selectionError) throw new Error("private auth details");
      if (!state.selection) return false;
      const previousModel = ctx.model;
      ctx.model = model;
      state.thinking = "medium";
      await handlers.get("model_select")?.({ type: "model_select", model, previousModel, source: "set" }, ctx);
      return true;
    },
  };
  registerModelMemory(pi, { store, launch: { ...defaultLaunch, ...launch } });
  const endpoint = endpointFor(original)!;
  const seed = (id = candidate.id) => store.records.set(endpoint.key, {
    version: 1, endpointKey: endpoint.key, provider: endpoint.provider, modelId: id, updatedAt: "2026-09-30T00:00:00.000Z",
  });
  const start = (reason: SessionStartEvent["reason"] = "startup") =>
    handlers.get("session_start")!({ type: "session_start", reason }, ctx);
  const select = (source = "set", model = candidate) =>
    handlers.get("model_select")!({ type: "model_select", model, previousModel: original, source }, ctx);
  const command = (args = "") => commands.get("endpoint-model-memory").handler(args, ctx);
  return { store, endpoint, original, candidate, models, state, notices, ctx, flags, seed, start, select, command };
}

test("fresh startup restores same-endpoint model visibly without refreshing memory", async () => {
  const h = harness(); h.seed();
  await h.start();
  assert.equal(h.ctx.model, h.candidate);
  assert.equal(h.store.writes, 0);
  assert.equal(h.state.thinking, "medium"); // Pi handles ordinary per-model reasoning settings.
  assert.match(h.notices[0]!.message, /restored codex-local\/gpt-6\.1-sol/u);
  assert.equal(h.notices[0]!.type, "info");
});

test("no history or already-selected model retains Pi's selection", async () => {
  const h = harness(); await h.start();
  assert.equal(h.state.selected, 0);
  h.seed(h.original.id); await h.start();
  assert.equal(h.state.selected, 0);
  assert.equal(h.store.writes, 0);
});

test("new sessions restore even after an initial continue guard", async () => {
  const h = harness({ sessionSelection: true }); h.seed();
  await h.start(); assert.equal(h.store.reads, 0);
  await h.start("new"); assert.equal(h.ctx.model, h.candidate);
});

for (const reason of ["resume", "fork", "reload"] as const) {
  test(`${reason} never overwrites the session's own model`, async () => {
    const h = harness(); h.seed(); await h.start(reason);
    assert.equal(h.state.selected, 0); assert.equal(h.store.reads, 0);
  });
}
for (const type of ["message", "custom_message", "compaction", "branch_summary"]) {
  test(`existing ${type} history is not overridden`, async () => {
    const h = harness(); h.seed(); h.ctx.sessionManager.getBranch = () => [{ type }];
    await h.start(); assert.equal(h.store.reads, 0);
  });
}
for (const mode of ["print", "rpc", "json"]) {
  test(`${mode} neither restores nor records automated choices`, async () => {
    const h = harness(); h.seed(); h.ctx.mode = mode;
    await h.start(); await h.select();
    assert.equal(h.store.reads, 0); assert.equal(h.store.writes, 0);
  });
}
for (const launch of [{ cliHost: false }, { ephemeral: true }, { explicitSelection: true }]) {
  test(`startup respects launch guard ${JSON.stringify(launch)}`, async () => {
    const h = harness(launch); h.seed(); await h.start(); assert.equal(h.store.reads, 0);
  });
}

test("off disables automatic behavior; invalid flags warn without enabling it", async () => {
  const h = harness(); h.seed(); h.flags.set("endpoint-model-memory", "off");
  await h.start(); await h.select(); assert.equal(h.store.reads, 0); assert.equal(h.store.writes, 0);
  h.flags.set("endpoint-model-memory", "bad"); await h.start();
  assert.equal(h.state.selected, 0); assert.match(h.notices.at(-1)!.message, /expected 'on' or 'off'/u);
});

for (const failure of ["missing", "endpoint", "provider", "auth", "scope"]) {
  test(`unusable remembered model (${failure}) keeps the original`, async () => {
    const h = harness(); h.seed();
    if (failure === "missing") h.models.delete(h.candidate.id);
    if (failure === "endpoint") h.models.set(h.candidate.id, { ...h.candidate, baseUrl: "http://127.0.0.1:8319/v1" });
    if (failure === "provider") h.models.set(h.candidate.id, { ...h.candidate, provider: "other" });
    if (failure === "auth") h.state.auth = false;
    if (failure === "scope") h.ctx.scopedModels = [{ model: h.original }];
    await h.start();
    assert.equal(h.ctx.model, h.original); assert.equal(h.state.selected, 0);
    assert.match(h.notices.at(-1)!.message, /saved model is unavailable/u);
  });
}

test("matching scoped model is allowed and explicit thinking is preserved", async () => {
  const h = harness({ explicitThinking: true }); h.seed(); h.ctx.scopedModels = [{ model: h.candidate }];
  await h.start(); assert.equal(h.ctx.model, h.candidate); assert.equal(h.state.thinking, "max");
});

test("corrupt state/selection failure warnings do not leak raw error details", async () => {
  const h = harness(); h.seed(); h.store.failRead = true;
  await h.start(); assert.equal(h.ctx.model, h.original);
  h.store.failRead = false; h.state.selectionError = true;
  await h.start(); assert.equal(h.ctx.model, h.original);
  assert.ok(h.notices.every((notice) => !notice.message.includes("private")));
  h.state.selectionError = false; h.state.selection = false;
  await h.start(); assert.equal(h.ctx.model, h.original);
  h.state.selection = true; await h.select(); // A failed restore must release recording suppression.
  assert.equal(h.store.writes, 1);
});

test("concurrent user choice while reading history is not overwritten", async () => {
  const h = harness(); h.seed();
  const saved = h.store.read.bind(h.store);
  h.store.read = async (endpoint) => {
    h.ctx.model = fakeModel("codex-local", "user-picked", base);
    return saved(endpoint);
  };
  await h.start(); assert.equal(h.ctx.model.id, "user-picked"); assert.equal(h.state.selected, 0);
});

test("manual set/cycle update the independent endpoint, restore events do not", async () => {
  const h = harness();
  await h.select("restore"); assert.equal(h.store.writes, 0);
  await h.select("cycle"); assert.equal((await h.store.read(h.endpoint))?.modelId, h.candidate.id);
  const other = fakeModel("codex-local-8319", "gpt-6-luna", "http://127.0.0.1:8319/v1");
  await h.select("set", other);
  assert.equal((await h.store.read(endpointFor(other)!))?.modelId, "gpt-6-luna");
  assert.equal((await h.store.read(h.endpoint))?.modelId, h.candidate.id);
});

test("a failed save preserves active model and reports failure", async () => {
  const h = harness(); h.store.failWrite = true; await h.select();
  assert.equal(h.ctx.model, h.original); assert.match(h.notices.at(-1)!.message, /could not save/u);
  assert.ok(!h.notices.at(-1)!.message.includes("private"));
});

test("status and confirmed forget affect only the current endpoint, not Pi's active model", async () => {
  const h = harness(); h.seed();
  const other = fakeModel("other", "model", "https://other.invalid/v1");
  await h.store.remember(endpointFor(other)!, "model");
  await h.command(); assert.match(h.notices.at(-1)!.message, /Saved: gpt-6\.1-sol/u);
  h.state.confirm = false; await h.command("forget"); assert.equal(h.store.forgotten, 0);
  h.state.confirm = true; await h.command("forget"); assert.equal(await h.store.read(h.endpoint), undefined);
  assert.equal((await h.store.read(endpointFor(other)!))?.modelId, "model");
  assert.equal(h.ctx.model, h.original);
  await h.command("invalid"); assert.match(h.notices.at(-1)!.message, /Usage:/u);
});
