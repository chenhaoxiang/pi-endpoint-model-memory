import type {
  ExtensionAPI, ExtensionContext, ModelSelectEvent, SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { endpointFor } from "./endpoint.js";
import type { LaunchPolicy } from "./launch.js";
import type { MemoryStore } from "./store.js";

export interface ControllerOptions {
  store: MemoryStore;
  launch: LaunchPolicy;
}

/** The factory has no filesystem/model/network side effects. */
export function registerModelMemory(pi: ExtensionAPI, options: ControllerOptions): void {
  const { store, launch } = options;
  let restoring = false;

  pi.registerFlag("endpoint-model-memory", {
    description: "Endpoint model memory: on (default) or off",
    type: "string", default: "on",
  });

  const enabled = (ctx: ExtensionContext): boolean =>
    ctx.mode === "tui" && launch.cliHost && !launch.ephemeral && pi.getFlag("endpoint-model-memory") === "on";

  pi.on("session_start", async (event: SessionStartEvent, ctx) => {
    const flag = pi.getFlag("endpoint-model-memory");
    if (ctx.mode === "tui" && flag !== "on" && flag !== "off") {
      ctx.ui.notify("Endpoint model memory: expected 'on' or 'off'; automatic behavior disabled.", "warning");
    }
    if (!enabled(ctx) || !["startup", "new"].includes(event.reason) ||
        launch.explicitSelection || (event.reason === "startup" && launch.sessionSelection) || !ctx.model) return;
    if (ctx.sessionManager.getBranch().some((entry) =>
      ["message", "custom_message", "compaction", "branch_summary"].includes(entry.type))) return;
    const original = ctx.model;
    const endpoint = endpointFor(original);
    if (!endpoint) return;
    try {
      const remembered = await store.read(endpoint);
      if (!remembered || remembered.modelId === original.id) return;
      const candidate = ctx.modelRegistry.find(endpoint.provider, remembered.modelId);
      const allowed = ctx.scopedModels.length === 0 || ctx.scopedModels.some((item) =>
        item.model.provider === candidate?.provider && item.model.id === candidate.id);
      if (!candidate || endpointFor(candidate)?.key !== endpoint.key || !allowed ||
          !ctx.modelRegistry.hasConfiguredAuth(candidate)) {
        ctx.ui.notify("Endpoint model memory: saved model is unavailable for this endpoint/scope; keeping Pi's selection.", "warning");
        return;
      }
      // Guard a concurrent selection while disk state was being read.
      if (ctx.model?.provider !== original.provider || ctx.model.id !== original.id ||
          endpointFor(ctx.model)?.key !== endpoint.key) return;
      const thinking = pi.getThinkingLevel();
      restoring = true;
      try {
        const selected = await pi.setModel(candidate);
        if (!selected) {
          ctx.ui.notify("Endpoint model memory: model selection failed; keeping Pi's selection.", "warning");
          return;
        }
        if (launch.explicitThinking) pi.setThinkingLevel(thinking);
        ctx.ui.notify(`Endpoint model memory: restored ${candidate.provider}/${candidate.id}.`, "info");
      } finally {
        restoring = false;
      }
    } catch {
      ctx.ui.notify("Endpoint model memory: could not restore saved state; keeping Pi's selection.", "warning");
    }
  });

  pi.on("model_select", async (event: ModelSelectEvent, ctx) => {
    if (!enabled(ctx) || restoring || event.source === "restore") return;
    const endpoint = endpointFor(event.model);
    if (!endpoint) return;
    try {
      await store.remember(endpoint, event.model.id);
    } catch {
      ctx.ui.notify("Endpoint model memory: could not save the model choice; active model is unchanged.", "warning");
    }
  });

  pi.registerCommand("endpoint-model-memory", {
    description: "Inspect endpoint model memory, or forget the current endpoint's choice",
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (!["status", "forget"].includes(action)) {
        ctx.ui.notify("Usage: /endpoint-model-memory [status|forget]", "warning");
        return;
      }
      if (ctx.mode !== "tui") return;
      const endpoint = ctx.model ? endpointFor(ctx.model) : undefined;
      if (!endpoint) {
        ctx.ui.notify("Endpoint model memory: the current model has no supported configured endpoint.", "warning");
        return;
      }
      try {
        if (action === "forget") {
          if (await ctx.ui.confirm("Forget endpoint model memory?", "Remove only this endpoint's saved choice? The active model and Pi defaults will not change.")) {
            await store.forget(endpoint);
            ctx.ui.notify("Endpoint model memory: current endpoint's choice removed.", "info");
          }
          return;
        }
        const record = await store.read(endpoint);
        const state = enabled(ctx) ? "enabled" : "disabled";
        ctx.ui.notify(`Endpoint model memory (${state}): ${endpoint.provider} [${endpoint.key.slice(0, 12)}]\n` +
          (record ? `Saved: ${record.modelId}\nUpdated: ${record.updatedAt}` : "No saved model for this endpoint."), "info");
      } catch {
        ctx.ui.notify("Endpoint model memory: could not access saved state.", "warning");
      }
    },
  });
}
