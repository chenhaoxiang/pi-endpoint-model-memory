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
  // Session-local diagnosis only: never persisted, added to model context or used
  // to select a model. Old sessions without an observed attempt stay unknown.
  let restoreReason = "not-observed";
  const diagnosis = () => `Last restore decision: ${restoreReason} (session-local observation; not execution authentication).`;

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
    if (!enabled(ctx)) {
      restoreReason = ctx.mode !== "tui" ? "non-tui" : !launch.cliHost ? "non-cli-host" : launch.ephemeral ? "ephemeral" : flag === "off" ? "disabled" : "invalid-flag";
      return;
    }
    if (!["startup", "new"].includes(event.reason)) { restoreReason = "session-resume-fork-or-reload"; return; }
    if (launch.explicitSelection) { restoreReason = "explicit-cli-selection"; return; }
    if (event.reason === "startup" && launch.sessionSelection) { restoreReason = "startup-session-selection"; return; }
    if (!ctx.model) { restoreReason = "current-model-unavailable"; return; }
    if (ctx.sessionManager.getBranch().some((entry) =>
      ["message", "custom_message", "compaction", "branch_summary"].includes(entry.type))) { restoreReason = "existing-conversation"; return; }
    restoreReason = "checking-saved-choice";
    const original = { provider: ctx.model.provider, id: ctx.model.id };
    const startupEndpoint = endpointFor(ctx.model);
    try {
      // An explicit provider keeps endpoint-only behavior. Without a last-choice
      // pointer, v0.1 records also remain usable without guessing global recency.
      const last = !launch.explicitProvider && store.readLastSelection && store.rememberSelection
        ? await store.readLastSelection() : undefined;
      const remembered = last ?? (startupEndpoint ? await store.read(startupEndpoint) : undefined);
      if (!remembered) { restoreReason = "no-saved-choice"; return; }
      const candidate = ctx.modelRegistry.find(remembered.provider, remembered.modelId);
      const allowed = ctx.scopedModels.length === 0 || ctx.scopedModels.some((item) =>
        item.model.provider === candidate?.provider && item.model.id === candidate?.id);
      if (!candidate || endpointFor(candidate)?.key !== remembered.endpointKey || !allowed ||
          !ctx.modelRegistry.hasConfiguredAuth(candidate)) {
        // Never fall back to an older provider when the last choice is unusable.
        restoreReason = "saved-choice-unavailable";
        ctx.ui.notify("Endpoint model memory: saved model is unavailable for its endpoint/scope; keeping Pi's selection.", "warning");
        return;
      }
      if (candidate.provider === original.provider && candidate.id === original.id) { restoreReason = "already-selected"; return; }
      // Guard a concurrent selection while disk state was being read.
      if (ctx.model?.provider !== original.provider || ctx.model.id !== original.id ||
          endpointFor(ctx.model)?.key !== startupEndpoint?.key) { restoreReason = "selection-changed-during-read"; return; }
      const thinking = pi.getThinkingLevel();
      restoring = true;
      try {
        const selected = await pi.setModel(candidate);
        if (!selected) {
          restoreReason = "selection-refused";
          ctx.ui.notify("Endpoint model memory: model selection failed; keeping Pi's selection.", "warning");
          return;
        }
        if (launch.explicitThinking) pi.setThinkingLevel(thinking);
        restoreReason = "restored";
        ctx.ui.notify(`Endpoint model memory: restored ${candidate.provider}/${candidate.id}.`, "info");
      } finally {
        restoring = false;
      }
    } catch {
      restoreReason = "restore-unavailable";
      ctx.ui.notify("Endpoint model memory: could not restore saved state; keeping Pi's selection.", "warning");
    }
  });

  pi.on("model_select", async (event: ModelSelectEvent, ctx) => {
    if (!enabled(ctx) || restoring || event.source === "restore") return;
    const endpoint = endpointFor(event.model);
    if (!endpoint) {
      ctx.ui.notify("Endpoint model memory: this model has no supported configured endpoint; choice was not saved.", "warning");
      return;
    }
    try {
      if (store.readLastSelection && store.rememberSelection) await store.rememberSelection(endpoint, event.model.id);
      else await store.remember(endpoint, event.model.id);
    } catch {
      ctx.ui.notify("Endpoint model memory: could not save the model choice; active model is unchanged.", "warning");
    }
  });

  pi.registerCommand("endpoint-model-memory", {
    description: "Inspect endpoint model memory and the last provider/model choice, or forget the current endpoint's choice",
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (!["status", "forget"].includes(action)) {
        ctx.ui.notify("Usage: /endpoint-model-memory [status|forget]", "warning");
        return;
      }
      if (ctx.mode !== "tui") return;
      const endpoint = ctx.model ? endpointFor(ctx.model) : undefined;
      const latestSelection = async (): Promise<string> => {
        if (!(store.readLastSelection && store.rememberSelection)) return "No globally remembered selection.";
        try {
          const last = await store.readLastSelection();
          return last ? `Last selected: ${last.provider}/${last.modelId}\nLast updated: ${last.updatedAt}` : "No globally remembered selection.";
        } catch {
          return "Last selected: unavailable (saved state is corrupt or unreadable).";
        }
      };
      if (!endpoint) {
        if (action === "forget") {
          ctx.ui.notify("Endpoint model memory: the current model has no supported configured endpoint.", "warning");
        } else {
          const state = enabled(ctx) ? "enabled" : "disabled";
          ctx.ui.notify(`Endpoint model memory (${state}): current model has no supported configured endpoint.\n${await latestSelection()}\n${diagnosis()}`, "info");
        }
        return;
      }
      try {
        if (action === "forget") {
          if (await ctx.ui.confirm("Forget endpoint model memory?", "Remove this endpoint's saved choice and clear it if it is the last selected provider/model? The active model and Pi defaults will not change.")) {
            const result = await store.forget(endpoint);
            ctx.ui.notify("Endpoint model memory: current endpoint's choice removed.", "info");
            if (result && "lastSelectionUnavailable" in result && result.lastSelectionUnavailable) {
              ctx.ui.notify("Endpoint model memory: last selection could not be accessed; its saved bytes were preserved.", "warning");
            }
          }
          return;
        }
        const record = await store.read(endpoint);
        const state = enabled(ctx) ? "enabled" : "disabled";
        const current = record ? `Saved: ${record.modelId}\nUpdated: ${record.updatedAt}` : "No saved model for this endpoint.";
        const latest = await latestSelection();
        ctx.ui.notify(`Endpoint model memory (${state}): ${endpoint.provider} [${endpoint.key.slice(0, 12)}]\n${current}\n${latest}\n${diagnosis()}`, "info");
      } catch {
        ctx.ui.notify(`Endpoint model memory: could not access saved state.\n${diagnosis()}`, "warning");
      }
    },
  });
}
