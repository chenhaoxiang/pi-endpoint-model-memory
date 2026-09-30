import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ExtensionUIContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { registerModelMemory } from "../src/controller.js";
import { endpointFor } from "../src/endpoint.js";
import type { LaunchPolicy } from "../src/launch.js";
import { FileMemoryStore } from "../src/store.js";
import { fixture, cleanup } from "./fixtures.js";

const execute = promisify(execFile);
const launch: LaunchPolicy = {
  cliHost: true, explicitSelection: false, sessionSelection: false, explicitThinking: false, ephemeral: false,
};
const modelConfig = (id: string) => ({ id, reasoning: true, input: ["text"], contextWindow: 32768, maxTokens: 1024 });

async function syntheticHost() {
  const root = await fixture("pi");
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const providers = Object.fromEntries(["primary", "secondary"].map((id, index) => [id, {
    api: "openai-completions", baseUrl: `http://endpoint-${index}.invalid/v1`, apiKey: "synthetic-only-not-a-real-key",
    models: [modelConfig("default"), modelConfig("recent")],
  }]));
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers }));
  await writeFile(join(agentDir, "auth.json"), "{}");
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
    modelsStorePath: join(agentDir, "models-store.json"), allowModelNetwork: false,
  });
  const store = new FileMemoryStore(join(agentDir, "endpoint-model-memory"));
  const settings = SettingsManager.inMemory({
    defaultProvider: "primary", defaultModel: "default", defaultThinkingLevel: "high", cacheWarming: "off",
  });
  const create = async (options: { provider?: string; mode?: "tui" | "rpc"; explicit?: boolean; reason?: SessionStartEvent["reason"]; existing?: boolean } = {}) => {
    const provider = options.provider ?? "primary";
    const sessionManager = SessionManager.create(root, join(root, "sessions"));
    if (options.existing) {
      sessionManager.appendModelChange(provider, "default");
      sessionManager.appendMessage({ role: "user", content: "synthetic local history", timestamp: Date.now() });
    }
    const loader = new DefaultResourceLoader({
      cwd: root, agentDir, settingsManager: settings,
      noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
      extensionFactories: [(pi) => registerModelMemory(pi, { store, launch: { ...launch, explicitSelection: Boolean(options.explicit) } })],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const result = await createAgentSession({
      cwd: root, agentDir, modelRuntime: runtime, settingsManager: settings, sessionManager,
      resourceLoader: loader, model: runtime.getModel(provider, "default")!, tools: [],
      sessionStartEvent: { type: "session_start", reason: options.reason ?? "startup" },
    });
    const errors: string[] = [];
    const notifications: string[] = [];
    await result.session.bindExtensions({
      mode: options.mode ?? "tui",
      uiContext: { notify: (message: string) => notifications.push(message), confirm: async () => true } as unknown as ExtensionUIContext,
      onError: (error) => errors.push(error.error),
    });
    assert.deepEqual(errors, []);
    return { ...result, sessionManager, notifications };
  };
  return { root, agentDir, runtime, store, settings, create };
}

test("real Pi binding records selection, restores a fresh session, and keeps settings/context clean", async () => {
  const h = await syntheticHost();
  try {
    const first = await h.create();
    assert.equal(first.session.model?.id, "default");
    const recent = h.runtime.getModel("primary", "recent")!;
    await first.session.setModel(recent);
    const endpoint = endpointFor(recent)!;
    const recorded = await h.store.read(endpoint);
    assert.equal(recorded?.modelId, "recent");
    first.session.dispose();
    const second = await h.create();
    assert.equal(second.session.model?.id, "recent");
    assert.deepEqual(await h.store.read(endpoint), recorded); // automatic restore must not refresh recency
    assert.ok(second.notifications.some((message) => message.includes("restored primary/recent")));
    assert.equal(h.settings.getDefaultModel(), "default");
    assert.equal(h.settings.getDefaultProvider(), "primary");
    assert.deepEqual(second.sessionManager.buildSessionContext().messages, []);
    assert.ok(second.sessionManager.getBranch().every((entry) => ["model_change", "thinking_level_change"].includes(entry.type)));
    second.session.dispose();
  } finally { await cleanup(h.root); }
});

test("real Pi two-provider state stays isolated and honor explicit/resumed/reloaded/RPC choices", async () => {
  const h = await syntheticHost();
  try {
    for (const provider of ["primary", "secondary"]) {
      const recent = h.runtime.getModel(provider, "recent")!;
      await h.store.remember(endpointFor(recent)!, "recent");
    }
    const second = await h.create({ provider: "secondary" });
    assert.equal(second.session.model?.provider, "secondary");
    assert.equal(second.session.model?.id, "recent");
    second.session.dispose();
    for (const options of [{ explicit: true }, { reason: "resume" as const }, { reason: "reload" as const }, { existing: true }, { mode: "rpc" as const }]) {
      const instance = await h.create(options);
      assert.equal(instance.session.model?.id, "default");
      instance.session.dispose();
    }
    assert.equal((await readdir(h.store.directory)).length, 2);
  } finally { await cleanup(h.root); }
});

test("actual package entry loads in isolated Pi CLI help without changing configuration or creating state", async () => {
  const root = await fixture("cli-help");
  try {
    const config = "{}\n";
    await writeFile(join(root, "settings.json"), config);
    const cli = resolve("node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
    const { stdout, stderr } = await execute(process.execPath, [cli, "--offline", "--no-extensions", "--no-skills", "--no-context-files", "--no-themes", "-e", resolve("src/index.ts"), "--help"], {
      cwd: root, timeout: 20000,
      env: { PATH: process.env.PATH, HOME: root, PI_CODING_AGENT_DIR: root, PI_OFFLINE: "1", PI_TELEMETRY: "0", PI_SKIP_VERSION_CHECK: "1" },
    });
    assert.match(stdout, /--endpoint-model-memory/u);
    assert.ok(!stderr.includes("Failed to load extension"), stderr);
    assert.equal(await readFile(join(root, "settings.json"), "utf8"), config);
    assert.ok(!(await readdir(root)).includes("endpoint-model-memory"));
  } finally { await cleanup(root); }
});

test("independent OS processes atomically write the same/different endpoint files", async () => {
  const root = await fixture("process-writes");
  try {
    const directory = join(root, "state");
    const script = join(root, "writer.mjs");
    const storeUrl = pathToFileURL(resolve("src/store.ts")).href;
    await writeFile(script, `import { FileMemoryStore } from ${JSON.stringify(storeUrl)};\nconst [directory,key,provider,model] = process.argv.slice(2);\nawait new FileMemoryStore(directory).remember({key,provider},model);\n`);
    const first = endpointFor({ provider: "first", id: "default", api: "openai-completions", baseUrl: "https://first.invalid/v1" })!;
    const second = endpointFor({ provider: "second", id: "default", api: "openai-completions", baseUrl: "https://second.invalid/v1" })!;
    await Promise.all(Array.from({ length: 8 }, (_, index) => {
      const endpoint = index % 2 ? first : second;
      return execute(process.execPath, ["--import", "tsx", script, directory, endpoint.key, endpoint.provider, `model-${index}`], { cwd: process.cwd(), timeout: 10000 });
    }));
    const store = new FileMemoryStore(directory);
    assert.match((await store.read(first))!.modelId, /^model-[1357]$/u);
    assert.match((await store.read(second))!.modelId, /^model-[0246]$/u);
    assert.deepEqual((await readdir(directory)).sort(), [`${first.key}.json`, `${second.key}.json`].sort());
  } finally { await cleanup(root); }
});
