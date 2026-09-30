---
doc_type: spec
project: workspace
component: pi-endpoint-model-memory
status: active
truth_mode: maintained
created: 2026-09-30
verified: 2026-09-30
owner: chx
ssot: true
---

# Endpoint-scoped model memory

## Scope

Pi 0.99.1+ standalone extension, approved by the owner to implement a new project. This document describes the v0.1 contract; it does not approve a GitHub push to main, publication, or machine-wide installation. The project uses a small single-owner spec instead of initializing an additional OpenSpec workflow.

Keep Pi's ordinary provider/default choice. On a **fresh interactive TUI session**, replace only its model with the most recently remembered model for exactly the same provider, configured catalog base URL, and API type. Never choose a provider by globally most recent activity. The user can select a startup provider through Pi's `--provider` or saved default.

## Selection precedence

1. Explicit `--model`, `--models`, or `--api-key` keeps the CLI selection. Arguments after `--` and values supplied to other flags are not interpreted as model flags.
2. Startup resume/continue/session/fork options and conversations already containing message/custom-message/compaction/branch-summary entries keep the session's own selection.
3. `/resume`, `/fork`, and `/reload` never apply endpoint memory.
4. Ordinary fresh startup and `/new` can restore the matching endpoint's remembered model. A `--thinking` selection is preserved when changing the model; other reasoning defaults are handled by Pi.
5. If no matching usable history exists, keep the model Pi already selected. A missing model, endpoint change, unavailable configured auth, or scoped-model exclusion does not cause an alternative-provider fallback.

Ephemeral `--no-session` runs and non-TUI print/JSON/RPC/SDK hosts do not automatically restore or record. SDK TUI hosts are excluded unless they deliberately pass CLI-host eligibility through the reusable controller; the package entry recognizes ordinary Pi CLI entry points only.

## Recording

Persist TUI `model_select` events with source `set` or `cycle`, not `restore`. Ignore the extension's own restore operation. Do not record startup defaults, session restores, ordinary shutdown, or reasoning-level changes.

The public `model_select` hook does not identify the caller: another extension's `pi.setModel()` in TUI emits the same `set` source as `/model`. Such later changes are recorded too; this extension does **not** claim perfect human-only event attribution. CLI-selected startup models are honored but are not themselves treated as interactive choices.

`Ctrl+S` retains Pi's native global-default behavior; this extension never rewrites `settings.json`. A remembered endpoint model may override that ordinary startup default, but selecting/saving a different model updates both through Pi's normal event path. Project settings/CLI scopes are still checked before restoring.

## Identity and privacy

Identity is SHA-256 of a versioned JSON tuple `[provider, api, normalized baseUrl]`. Parse only HTTP(S) URLs; normalize the host/default port through the URL parser and trailing path slashes; ignore fragments. Preserve path case, query values/order, scheme, and non-default port in the fingerprint so distinct routes are not conflated. Reject URL userinfo, unresolved/interpolated values, and invalid URLs rather than hashing credentials or guessing.

Use `model.baseUrl` from Pi's composed catalog. Do not evaluate `!command`, read auth.json, resolve OAuth, or call `getApiKeyAndHeaders()` merely to discover an endpoint. Runtime-only URL changes hidden inside credentials or a custom transport are outside this key; the configured URL is not a claim about the ultimate upstream destination.

Storage contains the digest, provider ID, model ID, schema version, and UTC update time only. No raw URL, URL credentials/query, API key, headers, conversation text, or reasoning data is stored or added to model context.

## Storage and concurrency

Default directory: `<Pi agentDir>/endpoint-model-memory/`. Honor Pi's `getAgentDir()` / `PI_CODING_AGENT_DIR`. One `<digest>.json` file per endpoint avoids read-modify-write of a shared map; two providers/endpoints never overwrite each other's records.

- Write a unique file with exclusive create and mode 0600; sync it, close it, then atomically rename it over the record in the same directory.
- A newly created state directory requests mode 0700. Existing directory permissions are not broadened or silently repaired.
- Same-process updates are serialized. Across processes, the last completed atomic rename for the **same** endpoint wins. This is intentional recency semantics, not event-time ordering or distributed locking.
- Reads validate schema, digest/provider ownership, identifiers, bounded file size, and timestamp. Corrupt/unknown schema is reported, never silently accepted or reset while loading.
- A successful later explicit model choice may replace that endpoint's corrupt record. `forget` deletes only the current endpoint after confirmation.
- No background watcher, exit-time writes, shared JSON locking, database, or persistent event log.

## Failure handling and management

`/endpoint-model-memory` (or `status`) shows the current provider, a short digest, and remembered model/time. `forget` asks for confirmation and removes only the current endpoint's record without changing the active model or defaults. `--endpoint-model-memory off` disables automatic behavior for an invocation; it does not remove history.

Warnings contain fixed messages, never arbitrary exceptions/JSON/URLs. Restore only a currently registered, same-key, scope-allowed model with configured authentication. Preserve Pi's original selection if checks fail. Automatic restoration is visible through a notification, not a hidden model-context message.

## Acceptance

Provider-free tests cover distinct providers/ports/paths/protocols, normalization, state validation, private URL exclusion, per-endpoint/concurrent writes, explicit CLI choices, continued/forked/reloaded sessions, fresh startup/new, scopes, reasoning overrides, failures, non-TUI exclusion, self-restore suppression, and commands. Real Pi smoke tests use synthetic catalog entries and isolated agent directories, bind lifecycle handlers and inspect selection/session state, and never prompt a real provider.
