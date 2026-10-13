import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { registerModelMemory } from "../src/controller.js";
import { endpointFor } from "../src/endpoint.js";
import { launchPolicy } from "../src/launch.js";
import type { LaunchPolicy } from "../src/launch.js";
import { FileMemoryStore } from "../src/store.js";
import { cleanup, fixture } from "./fixtures.js";

const defaultLaunch: LaunchPolicy = {
  cliHost: true, explicitSelection: false, sessionSelection: false, explicitThinking: false, ephemeral: false,
};

async function host() {
  const root = await fixture("last-selection");
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const providers = Object.fromEntries(["codex-local", "zai-coding-cn"].map((provider, index) => [provider, {
    api: "openai-completions", baseUrl: `https://provider-${index}.invalid/v1`,
    apiKey: "synthetic-only-not-a-real-key",
    models: ["default", "recent"].map((id) => ({
      id, reasoning: true, input: ["text"], contextWindow: 32768, maxTokens: 1024,
    })),
  }]));
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers }));
  await writeFile(join(agentDir, "auth.json"), "{}");
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
    modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false,
  });
  const settings = SettingsManager.inMemory({
    defaultProvider: "codex-local", defaultModel: "default", cacheWarming: "off",
  });
  const directory = join(agentDir, "endpoint-model-memory");
  const create = async (options: {
    provider?: string; launch?: Partial<LaunchPolicy>; reason?: SessionStartEvent["reason"];
    mode?: "tui" | "rpc"; existing?: boolean; scoped?: boolean;
  } = {}) => {
    // Each new host uses a separate store, just like a restarted Pi process.
    const store = new FileMemoryStore(directory);
    const provider = options.provider ?? "codex-local";
    const model = runtime.getModel(provider, "default")!;
    const sessionManager = SessionManager.create(root, join(root, "sessions"));
    if (options.existing) {
      sessionManager.appendModelChange(provider, "default");
      sessionManager.appendMessage({ role: "user", content: "synthetic history", timestamp: Date.now() });
    }
    const loader = new DefaultResourceLoader({
      cwd: root, agentDir, settingsManager: settings,
      noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
      extensionFactories: [(pi) => {
        registerModelMemory(pi, { store, launch: { ...defaultLaunch, ...options.launch } });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { session } = await createAgentSession({
      cwd: root, agentDir, modelRuntime: runtime, settingsManager: settings, sessionManager,
      resourceLoader: loader, model, tools: [],
      scopedModels: options.scoped ? [{ model, thinkingLevel: "high" }] : undefined,
      sessionStartEvent: { type: "session_start", reason: options.reason ?? "startup" },
    });
    const notifications: string[] = [];
    const errors: string[] = [];
    await session.bindExtensions({
      mode: options.mode ?? "tui",
      uiContext: { notify: (message: string) => notifications.push(message), confirm: async () => true } as unknown as ExtensionUIContext,
      onError: (error) => errors.push(error.error),
    });
    assert.deepEqual(errors, []);
    return { session, store, sessionManager, notifications };
  };
  const select = async (provider: string, id = "recent") => {
    const instance = await create({ launch: { explicitSelection: true } });
    try {
      const model = runtime.getModel(provider, id)!;
      await instance.session.setModel(model);
      return model;
    } finally { instance.session.dispose(); }
  };
  return { root, agentDir, providers, directory, runtime, settings, create, select };
}

test("cross-provider selection is recorded and restored after a fresh host restart", async () => {
  const h = await host();
  try {
    const chosen = await h.select("zai-coding-cn");
    const endpoint = endpointFor(chosen)!;
    const saved = await new FileMemoryStore(h.directory).read(endpoint);
    const last = await new FileMemoryStore(h.directory).readLastSelection();
    assert.equal(saved?.provider, "zai-coding-cn");
    assert.equal(saved?.modelId, "recent");
    const next = await h.create();
    try {
      assert.equal(next.session.model?.provider, "zai-coding-cn");
      assert.equal(next.session.model?.id, "recent");
      assert.ok(next.notifications.some((message) => message.includes("restored zai-coding-cn/recent")));
      assert.deepEqual(await next.store.read(endpoint), saved);
      assert.deepEqual(await next.store.readLastSelection(), last);
      assert.equal(h.settings.getDefaultProvider(), "codex-local");
      assert.equal(h.settings.getDefaultModel(), "default");
      assert.deepEqual(next.sessionManager.buildSessionContext().messages, []);
    } finally { next.session.dispose(); }
  } finally { await cleanup(h.root); }
});

test("the last choice wins in both directions even with identical model IDs", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    const first = await h.create();
    assert.equal(first.session.model?.provider, "zai-coding-cn");
    first.session.dispose();
    await h.select("codex-local");
    const second = await h.create();
    assert.equal(second.session.model?.provider, "codex-local");
    assert.equal(second.session.model?.id, "recent");
    second.session.dispose();
    assert.equal((await second.store.read(endpointFor(h.runtime.getModel("zai-coding-cn", "recent")!)!))?.modelId, "recent");
  } finally { await cleanup(h.root); }
});

test("a cross-provider choice with the same ID as the startup model still restores its provider", async () => {
  const h = await host();
  try {
    await h.select("zai-coding-cn", "default");
    const next = await h.create();
    assert.equal(next.session.model?.provider, "zai-coding-cn");
    assert.equal(next.session.model?.id, "default");
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

for (const options of [
  { launch: { explicitSelection: true } }, { launch: { sessionSelection: true } },
  { reason: "resume" as const }, { reason: "fork" as const }, { reason: "reload" as const },
  { existing: true }, { mode: "rpc" as const }, { scoped: true },
  { launch: { cliHost: false } }, { launch: { ephemeral: true } },
]) {
  test(`cross-provider memory retains higher-priority selection ${JSON.stringify(options)}`, async () => {
    const h = await host();
    try {
      await h.select("zai-coding-cn");
      const next = await h.create(options);
      assert.equal(next.session.model?.provider, "codex-local");
      assert.equal(next.session.model?.id, "default");
      next.session.dispose();
    } finally { await cleanup(h.root); }
  });
}

test("new sessions also restore the last provider after the startup resume guard", async () => {
  const h = await host();
  try {
    await h.select("zai-coding-cn");
    const next = await h.create({ reason: "new", launch: { sessionSelection: true } });
    assert.equal(next.session.model?.provider, "zai-coding-cn");
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("explicit provider constrains endpoint memory without selecting the last different provider", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    const next = await h.create({ launch: launchPolicy(["node", "cli.js", "--provider", "codex-local"]) });
    assert.equal(next.session.model?.provider, "codex-local");
    assert.equal(next.session.model?.id, "recent");
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("a changed endpoint rejects the global choice instead of falling back to an older channel", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    h.providers["zai-coding-cn"]!.baseUrl = "https://changed.invalid/v1";
    await writeFile(join(h.agentDir, "models.json"), JSON.stringify({ providers: h.providers }));
    await h.runtime.refresh({ allowNetwork: false });
    const next = await h.create();
    assert.equal(next.session.model?.provider, "codex-local");
    assert.equal(next.session.model?.id, "default");
    assert.ok(next.notifications.some((message) => message.includes("unavailable")));
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("legacy endpoint files remain usable without inferring global recency", async () => {
  const h = await host();
  try {
    const store = new FileMemoryStore(h.directory);
    for (const provider of ["codex-local", "zai-coding-cn"]) {
      const model = h.runtime.getModel(provider, "recent")!;
      await store.remember(endpointFor(model)!, "recent");
    }
    const next = await h.create();
    assert.equal(next.session.model?.provider, "codex-local");
    assert.equal(next.session.model?.id, "recent");
    next.session.dispose();
    assert.equal((await readdir(h.directory)).length, 2);
  } finally { await cleanup(h.root); }
});

test("a missing last-selected model keeps Pi's original choice, not older endpoint memory", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    h.providers["zai-coding-cn"]!.models = h.providers["zai-coding-cn"]!.models.filter((model) => model.id !== "recent");
    await writeFile(join(h.agentDir, "models.json"), JSON.stringify({ providers: h.providers }));
    await h.runtime.refresh({ allowNetwork: false });
    const next = await h.create();
    assert.equal(next.session.model?.provider, "codex-local");
    assert.equal(next.session.model?.id, "default");
    assert.ok(next.notifications.some((message) => message.includes("unavailable")));
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("corrupt global state reports a sanitized warning and preserves original selection and bytes", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    const path = join(h.directory, "last-selection.json");
    const bytes = "invalid JSON with synthetic-secret";
    await writeFile(path, bytes);
    const next = await h.create();
    assert.equal(next.session.model?.provider, "codex-local");
    assert.equal(next.session.model?.id, "default");
    assert.ok(next.notifications.some((message) => message.includes("could not restore")));
    assert.ok(next.notifications.every((message) => !message.includes("synthetic-secret")));
    assert.equal(await readFile(path, "utf8"), bytes);
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("confirmed forget clears the current global choice but leaves other endpoints intact", async () => {
  const h = await host();
  try {
    await h.select("codex-local");
    await h.select("zai-coding-cn");
    const next = await h.create();
    await next.session.prompt("/endpoint-model-memory forget");
    assert.equal(await next.store.readLastSelection(), undefined);
    assert.equal(await next.store.read(endpointFor(h.runtime.getModel("zai-coding-cn", "recent")!)!), undefined);
    assert.equal((await next.store.read(endpointFor(h.runtime.getModel("codex-local", "recent")!)!))?.modelId, "recent");
    assert.equal(next.session.model?.provider, "zai-coding-cn");
    next.session.dispose();
  } finally { await cleanup(h.root); }
});

test("status exposes the global saved choice without leaking URLs or synthetic auth", async () => {
  const h = await host();
  try {
    await h.select("zai-coding-cn");
    const next = await h.create({ launch: { explicitSelection: true } });
    await next.session.prompt("/endpoint-model-memory status");
    const notice = next.notifications.at(-1)!;
    assert.match(notice, /Last selected: zai-coding-cn\/recent/u);
    assert.ok(!notice.includes(".invalid") && !notice.includes("synthetic-only"));
    next.session.dispose();
    const files = await readdir(h.directory);
    for (const name of files) {
      const content = await readFile(join(h.directory, name), "utf8");
      assert.ok(!content.includes(".invalid") && !content.includes("synthetic-only"));
    }
  } finally { await cleanup(h.root); }
});
