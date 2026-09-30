---
doc_type: report
project: workspace
component: pi-endpoint-model-memory
status: completed
truth_mode: snapshot
created: 2026-09-30
verified: 2026-09-30
verified_by: manual
owner: chx
ssot: false
---

# MVP verification record

核验对象：`feat/endpoint-model-memory-mvp-20260930` worktree candidate。

## Commands and results

All commands ran in the isolated feature worktree and used synthetic models or disposable `tmp/` fixtures:

```text
npm run check
  typecheck: PASS
  npm test: PASS — 59/59
  build: PASS

npm run audit:runtime
  PASS — no production/runtime dependency vulnerabilities

npm audit --audit-level=high
  BLOCKED by the Pi 0.99.1 development dependency's nested shrinkwrap:
  @earendil-works/pi-coding-agent → minimatch@10.2.6 → brace-expansion@5.0.9
  The project has no production dependencies. The nested package is owned by the host
  Pi package; no local override was claimed because npm does not replace that shrinkwrapped
  copy. Recheck when the supported Pi dev dependency publishes a patched tree.

npm pack --dry-run --json
  PASS — pi-endpoint-model-memory-0.1.0.tgz
  8 packaged files, 17,690 unpacked bytes

git diff --check
  PASS
```

The 59 tests cover endpoint identity/normalization, URL and identifier rejection, explicit CLI/session precedence, fresh/new/resume/fork/reload/non-TUI behavior, scope/auth/unavailable model guards, reasoning preservation, sanitized failures, per-endpoint files, privacy, corruption validation, atomic writes, same-process serialization, cross-process writes, command behavior, and real Pi 0.99.1 SDK/CLI binding with synthetic catalogs.

No test sent a model prompt, read machine-wide credentials, changed `~/.pi/agent/settings.json`, changed `models.json`, or wrote a persistent Pi session. The CLI smoke test loaded the actual package entry with `--help`, confirmed `--endpoint-model-memory` registration, and confirmed its isolated settings file remained unchanged.

## Independent review

- Reviewer: `codex-local/gpt-6-astra:high` (fresh read-only context; probe status `ok`)
- Verdict: `APPROVE_WITH_COMMENTS`
- Blocker/major findings: `0`
- Residual minor notes: standard Pi CLI entry-name allowlist may need maintenance if Pi changes its official entry name; Pi's public `model_select` hook cannot distinguish a manual selection from another extension's `setModel()` call. Both are documented in the architecture and README and do not block the Pi 0.99.1 target.

## Delivery boundary

The code is implemented and verified in the feature worktree: runtime commit `f4f2640`, documentation/evidence follow-ups `2c6360a` and `22bf0ba`; current branch head `22bf0ba` is pushed to `origin/codex/endpoint-model-memory-mvp-20260930`. This record does **not** claim that the package was published to npm, globally installed, or enabled in the user's Pi configuration. The GitHub repository was empty at task start. After the owner explicitly authorized repository bootstrap, the exact reviewed branch head was initialized on remote `main` without force-push; remote `main` and `codex/endpoint-model-memory-mvp-20260930` now point to the same commit.
