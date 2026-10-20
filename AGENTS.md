# Project guidance

This is a standalone Pi package. Use the public extension API of Pi 1.3.0-fork.1 or newer (the maintained `chenhaoxiang/pi` fork); Pi 0.99.x is no longer a development or support baseline. Do not patch Pi or depend on unexported host modules. Keep the extension deterministic and provider-free: no model prompts, API probes, credential resolution, or writes to Pi's settings/models/session history.

Source changes must use an isolated branch/worktree. Never write the shared canonical checkout. Temporary fixtures, build output, screenshots, and logs belong under `tmp/`.

## Behavior and verification

- Actual TUI selections remember the complete provider + model and its endpoint digest. Fresh startup may restore the last provider/model across channels only after the saved endpoint, scope, and configured auth validate; never cross endpoints.
- If no global last-choice record exists, legacy endpoint-only records remain usable. An unusable global choice keeps Pi's startup model and never falls back to older provider history.
- Explicit CLI model/scope/auth choices, existing conversations, resume/fork, reload, and non-TUI runtimes must retain Pi's selection.
- Automatic restores must not update the remembered choice. Other extensions' `setModel()` events cannot be distinguished from manual choices by Pi's public hook; disclose this limitation.
- Failure must retain Pi's original model and report a sanitized warning. Do not persist credentials, raw URLs, headers, prompts, or private conversation data.
- Run `npm run check` and a package dry-run. Tests must use synthetic models and disposable `tmp/` agent directories, never the machine-wide configuration or live providers.
- `devDependencies` and root `overrides` pin the immutable public `chenhaoxiang/pi` `v1.3.0-fork.1` release tarballs; the lockfile carries their URLs and integrity hashes, so no local absolute path or SDK copy in `node_modules` may be committed. The maintained SDK tarball ships no `npm-shrinkwrap.json`, and its fork sub-packages are unpublished on npm, so the root `overrides` resolve them from the same release. Root `overrides` apply only to this checkout and never constrain consumers.
- Green local checks do not imply a GitHub merge, release, npm publication, or global installation. All such actions require applicable owner authorization; this unregistered public repository does not claim workspace AI auto-merge eligibility.

## Documentation map

- `README.md` / `README.zh-CN.md`: default English and full Chinese installation, selection precedence, commands, and limitations.
- `docs/releasing.md`: original-project SemVer, PR-only main, GitHub Releases, asset checksums and isolated installation verification.
- `docs/architecture/endpoint-model-memory.md`: owner behavior contract, cross-provider restoration, state format, lifecycle decisions/concurrency, and session-local read-only restore-reason status (2026-10-20 successor).
- `test/last-selection.test.ts` / `test/last-selection-store.test.ts`: cross-provider regression and persisted last-choice coverage.
- `docs/verification/mvp.md`: original v0.1.0 local evidence snapshot and delivery boundaries.
- `docs/verification/last-selected-provider.md`: 2026-10-14 cross-provider regression evidence and remaining delivery boundaries.
- `docs/verification/release-0.2.0.md`: v0.2.0 PR/release checksums, downloaded-asset verification, local installation, reload boundary, and rollback.
- `docs/verification/release-0.2.1.md`: v0.2.1 source-release preparation, existing restore-reason delivery gap, provider-free validation and separate publication/installation evidence boundary.
- `docs/verification/sdk-1.3.0-fork.1.md`: 2026-10-20 Pi `1.3.0-fork.1` baseline upgrade, immutable SDK asset pinning, brace-expansion advisory closure, full local check and delivery boundaries.
- `src/` / `test/`: implementation and provider-free regression tests.
