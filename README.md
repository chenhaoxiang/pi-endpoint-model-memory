# pi-endpoint-model-memory

English | [中文](README.zh-CN.md)

Remember the most recently selected Pi model separately for each **provider + API endpoint**. Useful when several OpenAI-compatible or Responses endpoints expose different models. This is an independent project, not a fork of another Pi extension.

## Behavior

For a new interactive TUI session or `/new`:

1. Pi first selects its provider/endpoint using its own settings.
2. The extension looks up memory only for that endpoint.
3. It restores the previous model only if the model remains available within the current scope and the same endpoint.
4. Otherwise it keeps Pi’s original selection.

An endpoint’s recent selection never causes Pi to switch to another endpoint. Endpoint identity combines provider, the configured model-catalog base URL, and API type.

### Selection precedence

- Explicit `--model`, `--models`, or `--api-key`: keep the explicit choice.
- `--continue`, `--resume`, `--session`, `--fork`, or an existing conversation: retain the conversation model.
- `/resume`, `/fork`, and `/reload`: do not apply automatic restoration.
- New interactive sessions only: restore endpoint-scoped memory.
- Pi’s native `Ctrl+S` can still save its global default; this extension never rewrites `settings.json`.

Only TUI `model_select` events are remembered, not startup defaults, session restoration, reload, or non-TUI runs. Pi’s public hook cannot distinguish `/model` from another extension’s `setModel()`, so other extensions’ model changes may also be recorded.

## Install

Install the reproducible release:

```bash
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.1.0
```

For the moving maintained branch, use `@main`. To try the current checkout without installing:

```bash
pi -e ./src/index.ts
```

Restart Pi after installation, or `/reload` in an existing session. Reload itself does not restore a model.

## Releases and maintenance

Current release: **0.1.0**. This original project uses ordinary SemVer and `v<version>` tags; it does not invent a community version or an `upstream-main` branch. `main` is the maintained default and release branch, updated through pull requests.

[GitHub Releases](https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases) provide an installable tarball, `release-manifest.json`, and `SHA256SUMS`. Verify checksums before installing downloaded assets. See [release maintenance](docs/releasing.md) for the per-version publishing and artifact installation process. A GitHub release does not imply npm publication or hot reload of active sessions.

## Inspect and clear memory

```text
/endpoint-model-memory status
/endpoint-model-memory forget
```

`status` displays the current endpoint record. `forget` deletes only that endpoint’s memory without changing the active model or global default. Disable automatic behavior for one invocation:

```bash
pi --endpoint-model-memory off
```

## Storage and privacy

The default storage directory is `<PI_CODING_AGENT_DIR>/endpoint-model-memory/`, normally `~/.pi/agent/endpoint-model-memory/`. Each endpoint has a SHA-256-named file, written via a temporary file and atomic rename. Concurrent writes to the same endpoint are last-completed-write wins; records never cross endpoints.

Records contain only schema version, endpoint digest, provider, model ID, and update time. They never contain API keys, headers, prompts, conversation contents, or raw URLs. The extension does not run `!command` credential resolvers or probe real endpoints. Set `PI_CODING_AGENT_DIR` to relocate Pi’s agent directory and its endpoint memory. Tests do not access machine-wide memory.

## Requirements

- Pi 0.99.1 or later.
- Node.js 22.19 or later, as required by Pi.
- Only Pi’s public extension API is used.

## Development and verification

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run --json
```

Tests use synthetic models, temporary directories, and provider-free state. They do not send model requests or read production credentials.

## Boundaries

This extension only remembers recently selected models by endpoint. It does not provide model health checks, automatic fallback, endpoint restart, credential refresh, global settings edits, or production API acceptance.

## License

MIT
