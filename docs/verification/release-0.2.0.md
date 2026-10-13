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

# v0.2.0 release and local-install closeout

## Authorized scope

The owner approved last-selected provider/model restoration across channels and subsequently approved PR merge, a new GitHub release, and machine-wide installation. This record covers that delivery only; it does not claim a live provider prompt or a hot reload of an already running Pi session.

## Source and review

- Implementation PR: <https://github.com/chenhaoxiang/pi-endpoint-model-memory/pull/3> (MERGED, ordinary merge; no admin bypass).
- Reviewed head: `aaba11a0db99495fc3c4605c31127703fc8a5d57`.
- Merged main/source commit: `00238d7085070cab8adf1891e2a12d45ce9e86e4`.
- Remote main was fetched/read back and confirmed to contain the reviewed head.
- Fresh independent source reviewer: `codex-local/deepseek-flash:high`; blocker 0, major 0, minor 1. Full final record is posted on PR #3 with SHA-256 `43e27f4b2a34a35370b64f1e6b263ba1092330b4ff2e1294038bab8f7471294e`.
- The minor warning note is retained: even when provider/model already matches Pi's current choice, a no-longer-matching saved endpoint may produce a warning. It changes neither selection nor saved state.
- PR checks read back as successful: GitGuardian Security Checks and `ai-pair-review`. The latter is a same-account review receipt, not an independent App identity or a second human approval. This personal repository has no Actions workflow/required CI checks and is not claimed to be registered for workspace AI auto-merge.

## Verification

| Target | Result |
|---|---|
| Pinned Pi 0.99.1 at exact reviewed head | Typecheck, 92/92 tests, build PASS |
| Installed Pi 1.1.0-fork.1 public SDK, isolated fixtures | Typecheck, 92/92 tests, build PASS |
| Merged main at exact source SHA | Fresh `npm ci --ignore-scripts`, 92/92 tests, typecheck, build PASS |
| Runtime dependency audit | 0 vulnerabilities |
| Package inspection | 10 files: source, package manifest, both READMEs, release runbook, LICENSE; no test/fixture/log artifacts |
| Pre-publication extracted package, isolated RPC | Extension command registered; empty synthetic session; zero provider prompts |
| Fresh downloaded public assets | Both SHA256SUMS entries PASS; isolated installed-Pi RPC load PASS |
| Actual installed plugin path | Files match fresh downloaded release; isolated Pi 1.1.0 RPC load PASS |

## Published artifact

- Release: <https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases/tag/v0.2.0>.
- Tag `v0.2.0` resolves to `00238d7085070cab8adf1891e2a12d45ce9e86e4`.
- Tarball: `pi-endpoint-model-memory-0.2.0.tgz`.
- Tarball SHA-256: `8b50d918d1ad6a976b9bd13cb797abb678b19282387424db31ad165def8ceb2b`.
- Manifest SHA-256: `e41548e407b4d6e956c62c7fe50197a8b68174f30942f42b98944447ee02bcce`.
- Release attaches tarball, `release-manifest.json`, and `SHA256SUMS`; assets were downloaded afresh and checked. The previous `v0.1.0` release/tag/assets were not overwritten.
- This is a GitHub Release, **not** an npm publication.

## Local installation and remaining runtime boundary

Installation used the installed Pi CLI:

```text
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.2.0
```

A before/after semantic comparison of global settings confirmed exactly one change: the endpoint-model-memory package pin moved from `v0.1.0` to `v0.2.0`. Model defaults and all other settings/package entries remained unchanged. Installed source files match the downloaded package, and installed Git HEAD/tag point to the released source SHA. No credentials or global model-memory records were written by validation.

Already running sessions were not forcibly reloaded. Use `/reload` or restart Pi, then switch to the desired provider/model. If already active, switch away and back so Pi emits `model_select`. `/reload` itself never restores or records a choice. After a real selection, `status` shows the globally remembered provider/model and subsequent fresh sessions restore it subject to endpoint/scope/auth validation.

The canonical local source main was safely fast-forwarded using the scoped `sync-local-mains.sh` entry; dirty/unrelated repositories were not touched.

## Rollback

The old published version is preserved. Reinstall the old pin if needed:

```text
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.1.0
```

Restart/reload afterward. Do not remove old endpoint history or the last-choice file merely to roll back: v0.1.0 does not consume the latter. Runtime requests, terminal UI reload, and a real user's subsequent selection remain unverified at this closeout snapshot.
