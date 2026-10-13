---
doc_type: spec
project: workspace
component: pi-endpoint-model-memory
status: active
truth_mode: maintained
created: 2026-09-30
verified: 2026-10-14
updated: 2026-10-14
owner: chx
ssot: true
---

# Last-selected provider/model memory with endpoint validation

## Scope

Pi 0.99.1+ standalone extension. On 2026-10-14 the owner approved restoring the last complete provider/model selection across channels, replacing the v0.1 endpoint-only restoration rule. This document describes that source contract; it does not approve a GitHub merge, publication, or machine-wide installation. The project uses this single-owner spec rather than an additional OpenSpec workflow.

On a **fresh interactive TUI session**, restore the last TUI-selected provider/model, even when it differs from Pi's ordinary default provider. Validate the selected model against the exact saved provider, configured catalog base URL, and API type before switching. Endpoint-specific records remain independent history, not alternative-provider fallback candidates. The restoration does not rewrite Pi settings.

## Selection precedence

1. Explicit `--model`, `--models`, or `--api-key` keeps the CLI selection. Arguments after `--` and values supplied to other flags are not interpreted as model flags. In compatible older Pi versions, provider-only `--provider` constrains restoration to the startup endpoint; Pi 1.1 requires `--provider` to accompany `--model`.
2. Startup resume/continue/session/fork options and conversations already containing message/custom-message/compaction/branch-summary entries keep the session's own selection.
3. `/resume`, `/fork`, and `/reload` never apply memory restoration.
4. Ordinary fresh startup and `/new` can restore the last complete choice. A `--thinking` selection is preserved when changing the model; other reasoning defaults are handled by Pi.
5. A present last-choice record is authoritative. If its model is missing, endpoint changes, configured auth is unavailable, or scope excludes it, warn and keep Pi's original selection rather than selecting older endpoint history.
6. If no last-choice record exists, retain v0.1 endpoint-only restoration for the startup endpoint. Do not scan old record timestamps or infer a last provider; the next interactive selection establishes the new record.

Ephemeral `--no-session` runs and non-TUI print/JSON/RPC/SDK hosts do not automatically restore or record. SDK TUI hosts are excluded unless they deliberately pass CLI-host eligibility through the reusable controller; the package entry recognizes ordinary Pi CLI entry points only.

## Recording

Persist TUI `model_select` events with source `set` or `cycle`, not `restore`. Ignore the extension's own restore operation. Do not record startup defaults, session restores, ordinary shutdown, or reasoning-level changes.

The public `model_select` hook does not identify the caller: another extension's `pi.setModel()` in TUI emits the same `set` source as `/model`. Such later changes are recorded too; this extension does **not** claim perfect human-only event attribution. CLI-selected startup models are honored but are not themselves treated as interactive choices.

`Ctrl+S` retains Pi's native global-default behavior; this extension never rewrites `settings.json`. The remembered provider/model may override that ordinary startup default. A selection also updates its endpoint history. Project/CLI model scopes are still checked before restoring. Unsupported configured endpoint URLs are not recorded, and a fixed sanitized warning makes that exclusion visible.

## Identity and privacy

Identity is SHA-256 of a versioned JSON tuple `[provider, api, normalized baseUrl]`. Parse only HTTP(S) URLs; normalize the host/default port through the URL parser and trailing path slashes; ignore fragments. Preserve path case, query values/order, scheme, and non-default port in the fingerprint so distinct routes are not conflated. Reject URL userinfo, unresolved/interpolated values, and invalid URLs rather than hashing credentials or guessing.

Use `model.baseUrl` from Pi's composed catalog. Do not evaluate `!command`, read auth.json, resolve OAuth, or call `getApiKeyAndHeaders()` merely to discover an endpoint. Runtime-only URL changes hidden inside credentials or a custom transport are outside this key; the configured URL is not a claim about the ultimate upstream destination.

Storage contains the digest, provider ID, model ID, schema version, and UTC update time only. No raw URL, URL credentials/query, API key, headers, conversation text, or reasoning data is stored or added to model context.

## Storage and concurrency

Default directory: `<Pi agentDir>/endpoint-model-memory/`. Honor Pi's `getAgentDir()` / `PI_CODING_AGENT_DIR`. One `<digest>.json` file per endpoint avoids read-modify-write of a shared map; two providers/endpoints never overwrite each other's history. `last-selection.json` stores one complete `MemoryRecord` (same allowed fields and version) for the last selected provider/model. Its digest is compared against the registered candidate, not against Pi's default provider.

- Write a unique file with exclusive create and mode 0600; sync it, close it, then atomically rename it over the record in the same directory.
- A newly created state directory requests mode 0700. Existing directory permissions are not broadened or silently repaired.
- Same-process updates are serialized. A selection writes endpoint history first, then atomically publishes its complete last-choice record. Across processes, the last completed rename for each file wins; timestamps do not decide order. This is not distributed locking or a multi-file transaction, so endpoint history and the global pointer need not have matching recency during concurrent writes. Restore uses the complete pointer itself; it never joins a provider from one file with a model from another.
- Reusable `MemoryStore` implementations opt into global memory by implementing both optional `readLastSelection` and `rememberSelection` methods; omitting either retains endpoint-only behavior for reads and writes. `FileMemoryStore.remember()` is an endpoint-only history primitive; `rememberSelection()` records an actual choice and updates both files. The shipped controller uses the latter when both methods are available.
- Reads validate schema, digest/provider ownership, identifiers, bounded file size, and timestamp. Corrupt/unknown schema is reported, never silently accepted or reset while loading.
- A successful later explicit model choice may replace corrupt endpoint and last-choice records. `forget` deletes the current endpoint after confirmation and clears the last-choice record when it points to that endpoint. It does not promote another endpoint to last choice. If the global pointer is corrupt/unreadable, endpoint deletion still succeeds; the pointer bytes are preserved and a fixed warning reports that global cleanup could not be verified. Forget is serialized within one store, not a cross-process compare-and-delete transaction.
- No background watcher, exit-time writes, shared JSON locking, database, or persistent event log.

## Failure handling and management

`/endpoint-model-memory` (or `status`) shows the current provider, a short digest, its remembered model/time, and the globally last selected provider/model/time. A corrupt/unreadable pointer is shown as unavailable without hiding the valid endpoint record. `forget` asks for confirmation, removes the current endpoint's record, and clears a matching last-choice record without changing the active model or defaults; corrupt pointer bytes are preserved with a warning. `--endpoint-model-memory off` disables automatic behavior for an invocation; it does not remove history.

Warnings contain fixed messages, never arbitrary exceptions/JSON/URLs. Restore only a currently registered, saved-key-matching, scope-allowed model with configured authentication. Preserve Pi's original selection if checks fail. Automatic restoration is visible through a notification, not a hidden model-context message.

## Acceptance

Provider-free tests cover distinct providers/ports/paths/protocols, normalization, state validation, private URL exclusion, endpoint and last-choice atomic writes, explicit CLI choices, continued/forked/reloaded sessions, fresh startup/new, scopes, reasoning overrides, failures, non-TUI exclusion, self-restore suppression, corrupt-pointer status/forget resilience, and commands. Cross-provider regressions verify default-provider mismatch, identical model IDs, both switching directions, changed/missing endpoints/models, corrupt pointers, old-record compatibility, and matching forget semantics. Real Pi smoke tests use synthetic catalog entries and isolated agent directories, bind lifecycle handlers and inspect selection/session state, and never prompt a real provider. Source verification for this change is linked from `AGENTS.md`.
