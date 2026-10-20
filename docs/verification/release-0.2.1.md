---
doc_type: report
project: workspace
component: pi-endpoint-model-memory
status: completed
truth_mode: snapshot
created: 2026-10-20
verified: 2026-10-20
verified_by: manual
verification_scope: v0.2.1 source-release preparation and provider-free local verification only
owner: chx
ssot: false
---

# v0.2.1 source-release verification

## Scope

The Owner requested completion of the existing optimization handoff, including real delivery gaps.
PR [#5](https://github.com/chenhaoxiang/pi-endpoint-model-memory/pull/5) merged the session-local
restore/skip reason at `8e6f26a35ed64962d6c32f1c3501614869ee8b42`, but the installed `v0.2.0`
release did not contain it. Version `0.2.1` packages that already-reviewed behavior without changing
selection precedence, endpoint validation, storage, model defaults, or providers.

This release-preparation diff changes only package/lockfile version metadata, the two installation
READMEs, and this verification pointer. No runtime source or test assertion is modified. The old
`v0.2.0` tag, release assets and installation remain available for rollback.

## Local verification

On the release candidate in an isolated worktree:

- `npm ci --ignore-scripts`: passed.
- `npm run check`: typecheck, **94 tests / 94 pass / 0 fail / 0 skip**, and build passed.
- `npm pack --dry-run --json`: passed; package inventory inspected separately before publication.
- `npm run audit:runtime`: passed, zero runtime vulnerabilities.
- `git diff --check`: passed.

These are local provider-free results, not workflow CI or a real-provider acceptance run. This
repository has no Actions workflow CI; do not label that absence as a successful CI run. Tests
retain synthetic catalogs and disposable agent directories; machine-wide model-memory records,
authentication sources and existing conversations are not test inputs.

## Publication and installation boundary

Follow [the existing release runbook](../releasing.md): ordinary reviewed PR merge, exact merged-main
source, immutable GitHub tag/release, installable tarball, exact-source manifest and SHA256SUMS,
fresh download/check, isolated Pi load, then a single pinned installation selection. Do not replace
old assets, publish to npm, restart shared services, or reload existing sessions. New-session
registration and deterministic synthetic lifecycle checks do not prove every old session loaded it.

This source-preparation snapshot does not pre-sign publication or installation. Their exact source,
asset hashes, fresh-download checks, installation readback and rollback result are recorded in the
[v0.2.1 GitHub Release](https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases/tag/v0.2.1)
notes after those operations actually finish.
