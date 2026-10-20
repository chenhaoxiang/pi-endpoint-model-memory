# pi-endpoint-model-memory

English | [中文](README.zh-CN.md)

Remember the last selected **provider + model**, with API-endpoint validation and independent endpoint history. Useful when switching between custom endpoints and built-in providers. This is an independent project, not a fork of another Pi extension.

## Behavior

For a new interactive TUI session or `/new`:

1. Pi first selects its ordinary startup model.
2. The extension reads the last interactive choice, including its provider.
3. It restores that provider/model only if the registered model still matches its saved endpoint, has configured auth, and remains within the current scope.
4. Otherwise it visibly keeps Pi’s original selection; it does not fall back to an older provider.

For example, selecting `zai-coding-cn/glm-5.3` after `codex-local/gpt-6.1-sol` restores `zai-coding-cn/glm-5.3` in the next fresh session. Endpoint identity still combines provider, configured model-catalog base URL, and API type. Models are never restored onto a different endpoint than the one they were selected on.

If there is no last-choice record yet, existing v0.1.0 endpoint files retain their original endpoint-only behavior. Switch to the desired model once after loading the update to start remembering the complete choice; if it is already active, switch away and back so Pi emits a selection event. Old timestamps are not used to guess the last provider.

### Selection precedence

- Explicit `--model`, `--models`, or `--api-key`: keep the explicit choice.
- `--provider` with `--model`: Pi 1.3 rejects a bare `--provider` (`--provider requires --model`), and the pair is an explicit selection, so Pi’s choice is kept and no other provider is queried.
- `--continue`, `--resume`, `--session`, `--fork`, or an existing conversation: retain the conversation model.
- `/resume`, `/fork`, and `/reload`: do not apply automatic restoration.
- New interactive sessions only: restore the last provider/model, validated against its remembered endpoint.
- Pi’s native `Ctrl+S` can still save its global default; this extension never rewrites `settings.json`.

Only TUI `model_select` events are remembered, not startup defaults, automatic memory restoration, session restoration, reload, or non-TUI runs. Pi’s public hook cannot distinguish `/model` from another extension’s `setModel()`, so other extensions’ model changes may also be recorded.

## Install

The cross-provider behavior was introduced in `v0.2.0`. Version `v0.2.1` also packages the session-local restore/skip reason shown by `status`; model-selection and storage behavior are unchanged. Published `v0.1.0` keeps endpoint-only restoration. Version `0.3.0` keeps all of that behavior and raises the Pi baseline to `1.3.0-fork.1`; it is not tagged or published yet. Install the pinned release:

```bash
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.2.1
```

For the moving maintained branch, use `@main`; it now requires Pi `1.3.0-fork.1` or newer, and its next source release is `0.3.0`. `v0.2.1` remains the last release that runs on Pi 0.99.1. To try the current checkout without installing:

```bash
pi -e ./src/index.ts
```

Restart Pi after installation, or `/reload` in an existing session. Reload itself does not restore a model.

## Releases and maintenance

Current source version: **0.3.0**, not yet tagged or published; the latest published release is **0.2.1**. This original project uses ordinary SemVer and `v<version>` tags; it does not invent a community version or an `upstream-main` branch. `main` is the maintained default and release branch, updated through pull requests.

[GitHub Releases](https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases) provide an installable tarball, `release-manifest.json`, and `SHA256SUMS`. Verify checksums before installing downloaded assets. See [release maintenance](docs/releasing.md) for the per-version publishing and artifact installation process. A GitHub release does not imply npm publication or hot reload of active sessions.

## Inspect and clear memory

```text
/endpoint-model-memory status
/endpoint-model-memory forget
```

`status` displays the current endpoint record, globally last selected provider/model, and last observed restore/skip reason (fixed codes, session-local only). `forget` deletes only that endpoint’s memory and clears the last-choice record if it points to that endpoint, without changing the active model or global default. A corrupt or unreadable last-choice record does not block status or deletion of a valid endpoint record; its bytes are preserved and a sanitized warning reports the incomplete global cleanup. Disable automatic behavior for one invocation:

```bash
pi --endpoint-model-memory off
```

## Storage and privacy

The default storage directory is `<PI_CODING_AGENT_DIR>/endpoint-model-memory/`, normally `~/.pi/agent/endpoint-model-memory/`. Each endpoint has a SHA-256-named file; `last-selection.json` holds the complete latest choice. Both use private temporary files and atomic rename. Same-process selections serialize; across processes, the last completed rename for each file wins. The last-choice record is authoritative, so endpoint history cannot override it. These files are not a multi-file transaction.

Records contain only schema version, endpoint digest, provider, model ID, and update time. They never contain API keys, headers, prompts, conversation contents, or raw URLs. The extension does not run `!command` credential resolvers or probe real endpoints. Set `PI_CODING_AGENT_DIR` to relocate Pi’s agent directory and its endpoint memory. Tests do not access machine-wide memory.

## Requirements

- Pi `1.3.0-fork.1` or later, from the maintained `chenhaoxiang/pi` fork. Pi 0.99.x is no longer developed against or supported.
- Node.js 22.19 or later, as required by Pi.
- Only Pi’s public extension API is used.

## Development and verification

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run --json
```

`devDependencies` and root `overrides` pin the immutable public release assets of `chenhaoxiang/pi` `v1.3.0-fork.1`; the lockfile records their URLs and integrity hashes, so no local absolute path is needed. The maintained SDK tarball ships no `npm-shrinkwrap.json`, and the fork sub-packages are not published to npm, so the root `overrides` resolve them from the same release. npm applies root `overrides` only in this checkout; they do not constrain anyone installing the extension.

`npm test`, and therefore `npm run check`, starts through `scripts/test-isolated.mjs`. Before any test process exists it creates an owned fixture under `tmp/test-isolation/`, points `HOME`, `PI_CODING_AGENT_DIR`, `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME`/`XDG_STATE_HOME` and `TMPDIR` there, and forwards only `PATH` plus locale and platform system keys. Inherited credentials, Pi overrides, `NODE_OPTIONS` and `npm_*` therefore never reach a test, and Google ADC discovery resolves inside the fixture. The wrapper logs only forwarded key names and fixed labels, writes `tmp/verification/test-isolation-receipt.json` (command, SDK versions, `homeIsRealHome: false`, cleanup result) and removes the fixture only when its ownership marker matches. `test/isolation.test.ts` fails if the suite is started outside this envelope, so run `npm test` rather than a bare test runner.

Tests use synthetic models, temporary directories, and provider-free state. They do not send model requests or read production credentials.

## Boundaries

This extension remembers the last selected provider/model and retains endpoint-specific history. It does not provide model health checks, automatic fallback, endpoint restart, credential refresh, global settings edits, or production API acceptance.

## License

MIT
