---
doc_type: runbook
project: workspace
status: active
truth_mode: maintained
created: 2026-10-06
verified: 2026-10-06
verified_by: manual
---

# Release maintenance

Applies to the independent original project chenhaoxiang/pi-endpoint-model-memory.

## Branches and versions

`main` is the maintained default/release branch and accepts changes through pull requests. Use ordinary SemVer and `v<version>` tags. No community base, fork suffix, or community mirror is claimed. Retain all historical branches and previous releases. Never reuse a published tag or replace its assets.

## SDK baseline

Development and release validation target the maintained `chenhaoxiang/pi` fork at `1.3.0-fork.1` or newer; Pi 0.99.x is no longer supported. `package.json` pins the public immutable coding-agent release tarball in `devDependencies`, and root `overrides` resolve its fork sub-packages (which are not published to npm) from the same `v1.3.0-fork.1` release assets. The lockfile records those URLs with integrity hashes, so `npm ci --ignore-scripts` is reproducible without any local path or vendored SDK. That tarball ships no `npm-shrinkwrap.json`. Check `npm audit` for both the development and `--omit=dev` runtime scopes; root `overrides` apply only to this checkout and do not constrain consumers of the installed package.

## Publish every version

1. Fetch origin/main and create an isolated worktree from its exact latest commit. Preserve unrelated dirty work.
2. Update package version, lockfile version metadata when changed, and both README files. English README is the default; the Chinese document links back.
3. Run `npm ci --ignore-scripts`, `npm run check`, and package inspection. `npm test` must run through `scripts/test-isolated.mjs`; keep the resulting `tmp/verification/test-isolation-receipt.json` with the release evidence. Tests use only synthetic models and temporary agent directories.
4. Review the exact diff and merge the PR normally; verify remote main contains the validated head.
5. Build the package at that exact main SHA using `npm pack --ignore-scripts --pack-destination tmp/release`. Extract the tarball and load it through isolated Pi RPC with a synthetic loopback model and no prompts. Include both README files and this runbook.
6. Generate `release-manifest.json` with repository, version, exact source commit, tarball filename and SHA-256; community fields are null. Generate `SHA256SUMS` for the tarball and manifest.
7. Create the public GitHub Release `v<version>` targeting that exact SHA with the package, provenance and checksums attached. No npm publication is implied.
8. Download the published assets afresh, check `shasum -a 256 -c SHA256SUMS`, and repeat isolated RPC loading. Release notes record PR, validation and remaining limitations.

## Installation and rollback

Use the pinned GitHub command in README. For artifact/offline installation, download all three assets, verify checksums, extract to a permanent user-owned directory, then run `pi install /absolute/path/to/package`. Keep the previous source/version to roll back. Restart or `/reload` after installing; changing disk files does not hot-reload existing sessions. Reload does not itself apply endpoint-memory restoration.

## 中文摘要

本项目使用自己的 SemVer，不冒充社区 fork。`main` 是经过 PR 整合的维护主线。每次发布都固定 tag、来源提交和安装制品，附 SHA-256 校验，下载回读后再次做不调用真实模型的隔离加载验证。英文说明为默认入口，中文说明同步维护。
