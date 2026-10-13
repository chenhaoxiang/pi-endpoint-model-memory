---
doc_type: report
project: workspace
component: pi-endpoint-model-memory
status: completed
truth_mode: snapshot
created: 2026-10-14
verified: 2026-10-14
verified_by: manual
owner: chx
ssot: false
---

# Cross-provider last-selection verification

## Scope and decision

The owner selected “restore the last selected provider and model” on 2026-10-14. The previous source contract restored only the startup endpoint's model and did not switch providers. The reported notification `Endpoint model memory: restored codex-local/gpt-6.1-sol.` was consistent with that old contract when Pi's default provider was `codex-local`.

Canonical repository: `chenhaoxiang/pi-endpoint-model-memory`. Candidate branch: `fix/last-selected-provider-20261014`, based on remote `main` at `96067303c9da33f98ffc68ec47964bef40813d63`. Implementation and verification ran only in its isolated worktree. No shared checkout or installed package was edited.

The change records one complete provider/model/digest record in `last-selection.json`, while retaining per-endpoint history. A fresh TUI session restores this choice only after catalog endpoint, scope, and configured-auth checks. Explicit CLI selection, existing conversations, resume/fork/reload, non-TUI, no-session and non-CLI hosts retain their selection. Automatic restoration does not refresh either record. Old endpoint-only records remain usable until an actual model selection writes the pointer.

## Reproduction and verification

The original 59 tests passed before implementation. New synthetic Pi integration tests first reproduced six failures, including a recorded `zai-coding-cn` choice returning to `codex-local`, identical model IDs on different providers, `/new`, and global status. The red evidence was preserved in the worktree's ignored `tmp/verification/cross-provider-red.log`.

After implementation:

| Check | Result |
|---|---|
| `npm run check`, pinned Pi 0.99.1 | Typecheck, 85/85 tests, build PASS |
| Same source/tests with installed Pi 1.1.0-fork.1 public SDK | Typecheck, 85/85 tests, build PASS |
| Real package entry CLI help in both SDK matrices | Registered flag, clean isolated settings, no state created |
| `npm pack --ignore-scripts --dry-run --json` | PASS; source entry and both README files included, no fixtures/logs |
| `npm run audit:runtime` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS |
| Canonical local main against fetched remote main | 0 ahead / 0 behind; clean |

The 1.1.0 matrix was created under `tmp/verification/current-sdk/`: source/tests were copied and only the coding-agent SDK dependency was linked to the installed release's public package. It used the same synthetic providers, disposable agent directories, offline mode, no prompts, and no machine-wide configuration.

Added coverage includes both cross-provider switch directions, identical model IDs, restart with a different default provider, `/new`, selection precedence, endpoint drift, missing models, corrupt global state, pointer privacy/permissions, same-process serialization, independent-store atomic writes, publish failure, confirmed forget, status, and v0.1 compatibility. Existing tests and assertions were not changed; additional tests were appended to the controller file during review follow-up.

## Review follow-up and 0.2.0 source candidate

Independent read-only review bound to `e7664670c14c27a28a182126fe444feeb321d995` returned `OK with notes`, blocker 0. Its new reachable P2 finding was reproduced: a corrupt global pointer blocked valid endpoint status/forget. The follow-up preserves corrupt pointer bytes, keeps current endpoint management usable, and reports sanitized partial-cleanup warnings. Global capability detection now requires both optional methods, and appended controller tests cover unsupported URLs, unsupported startup endpoints with valid pointers, silent no-op restoration, and incomplete injected store capabilities.

The 0.2.0 candidate updates package/lock version metadata and both installation instructions. After the review follow-up, both pinned Pi 0.99.1 and installed Pi 1.1.0-fork.1 matrices pass **91/91**, typecheck and build. Package dry-run and runtime audit also pass. The original 85-test result above remains the initial evidence. A final source-only follow-up makes global status visible even when the current model has an unsupported endpoint; its regression test brings both SDK matrices to **92/92**. Final raw logs are under `tmp/verification/final-92-*.log`.

## Remaining boundaries

- This report verifies source and isolated host integration, not live provider requests or the user's running TUI session.
- No credentials, auth commands, production model requests, settings defaults, or global memory were accessed by the tests.
- The complete pointer is authoritative; endpoint history and the pointer are separate atomic files, not a multi-file transaction or distributed lock.
- Pi's public hook still cannot distinguish another extension's `setModel()` from a manual selection.
- Source self-review and an independent read-only `codex-local/deepseek-flash:high` review were performed. GitHub push/PR/merge, release publication, npm publication, and installation are not proven by source validation.
- The owner additionally approved PR merge, a new GitHub release, and machine-wide upgrade. The installed `v0.1.0` pin remains unchanged at this source-validation stage. Once the update is loaded, switch to the desired model. If it is already active, switch away and back so Pi emits `model_select`.
