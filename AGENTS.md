# Project guidance

This is a standalone Pi package. Use the public extension API of Pi 0.99.1 or newer; do not patch Pi or depend on unexported host modules. Keep the extension deterministic and provider-free: no model prompts, API probes, credential resolution, or writes to Pi's settings/models/session history.

Source changes must use an isolated branch/worktree. Never write the shared canonical checkout. Temporary fixtures, build output, screenshots, and logs belong under `tmp/`.

## Behavior and verification

- Endpoint memory is scoped by provider + configured catalog base URL + API type. Never cross endpoints while restoring.
- Explicit CLI model/scope/auth choices, existing conversations, resume/fork, reload, and non-TUI runtimes must retain Pi's selection.
- Automatic restores must not update the remembered choice. Other extensions' `setModel()` events cannot be distinguished from manual choices by Pi's public hook; disclose this limitation.
- Failure must retain Pi's original model and report a sanitized warning. Do not persist credentials, raw URLs, headers, prompts, or private conversation data.
- Run `npm run check` and a package dry-run. Tests must use synthetic models and disposable `tmp/` agent directories, never the machine-wide configuration or live providers.
- Green local checks do not imply a GitHub merge, release, npm publication, or global installation. All such actions require applicable owner authorization; this unregistered public repository does not claim workspace AI auto-merge eligibility.

## Documentation map

- `README.md`: installation, selection precedence, commands, and limitations.
- `docs/architecture/endpoint-model-memory.md`: owner behavior contract, state format, lifecycle decisions, and concurrency semantics.
- `docs/verification/mvp.md`: local evidence and delivery boundaries.
- `src/` / `test/`: implementation and provider-free regression tests.
