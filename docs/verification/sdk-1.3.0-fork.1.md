---
doc_type: report
project: workspace
component: pi-endpoint-model-memory
status: completed
truth_mode: snapshot
created: 2026-10-20
verified: 2026-10-20
verified_by: manual
verification_scope: Pi 1.3.0-fork.1 development baseline upgrade, provider-free local verification only
owner: chx
ssot: false
---

# Pi 1.3.0-fork.1 development baseline

## Scope

The owner removed Pi 0.99.1 as a development and minimum-support baseline and required the maintained
`chenhaoxiang/pi` `v1.3.0-fork.1` release to run the full `npm run check`. This diff changes package and
lockfile metadata, both READMEs, `AGENTS.md`, the architecture spec's version statements,
`docs/releasing.md`, and this evidence note. No selection, endpoint, auth, scope, reasoning, storage or
concurrency behavior changed, and no existing test assertion was edited.

## SDK identity and provenance

- Source: public GitHub Release `chenhaoxiang/pi` `v1.3.0-fork.1`, release source commit
  `fda1390c4a42d8b637c9fc6915e581351f8e757b`, per that release's `release-manifest.json`.
- `@earendil-works/pi-coding-agent` tarball SHA-256
  `1b7afa43d9da495e221e54a9725a34384869fbe63884c35137f7b12b06474b59`, matching the release `SHA256SUMS`.
- All ten workspace tarballs of the release were downloaded and checked against `SHA256SUMS` before use.
- The coding-agent tarball carries no `npm-shrinkwrap.json` and depends on fork sub-packages that are
  not published to npm (`pi-agent-core`, `pi-ai`, `pi-codemode`, `pi-mcp`, `pi-tui`, and transitively
  `pi-telemetry`). `package.json` therefore pins the coding-agent tarball in `devDependencies` and
  resolves exactly those reachable sub-packages through root `overrides` to the same release assets.
  `chord`, `pi-durable` and `pi-env` are not reachable from that graph, so no override was added for
  them. Nothing is vendored, no absolute `file:` spec is used, and the lockfile records the release URLs
  with integrity hashes.
- Installed identities during verification: `pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-codemode`,
  `pi-mcp`, `pi-tui` and `pi-telemetry` all `1.3.0-fork.1`; `brace-expansion` `5.0.12`.

## Advisory closure

The previous development tree pinned `brace-expansion` 5.0.9 through the 0.99.1 shrinkwrap. That version
is affected by GHSA-qhr7-859c-m2p7 (high, `<5.0.11`), GHSA-6j4f-fj2g-mc7p (high, `<5.0.10`) and
GHSA-q2hr-2g5m-vwhr (moderate, `<5.0.12`). The 1.3.0-fork.1 tarball declares `brace-expansion` `5.0.12`
directly and the lockfile resolves it, so both audit scopes report zero vulnerabilities. No
`npm audit fix --force` and no unrelated override was applied.

## Local verification

On the upgrade worktree (Node `26.9.0`, npm `11.19.1`), with no real provider, credential or
machine-wide agent-directory access:

| Command | Result |
| --- | --- |
| downloaded release assets, `shasum -a 256` against `SHA256SUMS` | all ten match |
| `npm ci --ignore-scripts` from the lockfile | passed, 124 packages, 1.3.0-fork.1 set |
| `npm run typecheck` | passed |
| `npm test` | 94 tests, 94 pass, 0 fail, 0 skipped |
| `npm run build` | passed |
| `npm audit --audit-level=high` (development scope) | 0 vulnerabilities |
| `npm run audit:runtime` | 0 vulnerabilities |
| `npm pack --dry-run --json` | passed, 10 files, no SDK or `node_modules` |
| `git diff --check` | passed |

The suite needed no API adaptation: controller, store, launch and real-SDK binding tests ran unchanged
against 1.3.0-fork.1, including the isolated Pi CLI load and the synthetic two-provider restore matrix.

These are local provider-free results, not workflow CI or a real-provider acceptance run. This
repository has no Actions workflow CI; that absence must not be recorded as a successful CI run.

## Delivery boundary

This snapshot covers the source-level baseline upgrade only. It does not tag or publish `0.3.0`, publish
to npm, install globally, merge the change, or reload existing sessions. Publication, asset checksums and
installation readback remain separate operations requiring owner authorization. `v0.2.1` stays the last
release that runs on Pi 0.99.1.
