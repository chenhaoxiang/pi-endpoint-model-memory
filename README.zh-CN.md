# pi-endpoint-model-memory

[English](README.md) | 中文

一个 Pi 扩展，按 **provider + API endpoint** 记住最近选择的模型。适合同时使用多个 OpenAI-compatible 或 Responses API 端点，例如 `codex-local` 和 `codex-local-8319`。

本项目是独立的 Pi 扩展，不属于 `pi-subagents`、`pi-intercom` 或其他 Pi fork。

## 行为

在全新交互式 TUI 会话或 `/new` 中：

1. Pi 先按自身默认配置选定 provider/endpoint；
2. 扩展只查询这个 endpoint 的模型记忆；
3. 如果存在同 endpoint、当前仍可用且处于当前 scope 的历史模型，就恢复该模型；
4. 没有可用历史时，保持 Pi 原来的选择。

不同 endpoint 完全隔离。一个 endpoint 最近使用过的模型，不会让 Pi 自动切换到另一个 endpoint。

例如：

```text
codex-local       → 最近使用 kimi-k3
codex-local-8319  → 最近使用 gpt-6-sol
```

新会话进入对应 endpoint 后，只会恢复该 endpoint 的记录。

## 选择优先级

以下情况保留 Pi 原有选择，不执行自动恢复：

- 显式指定 `--model`、`--models` 或 `--api-key`；
- 使用 `--continue`、`--resume`、`--session`、`--fork` 或已有会话；
- 执行 `/resume`、`/fork` 或 `/reload`；
- 非 TUI 运行。

只有全新的交互式会话，才会应用对应 endpoint 最近记住的模型。Pi 原生 `Ctrl+S` 仍然可以保存全局默认模型；本扩展不会改写 `settings.json`。

扩展只记录 TUI 中发生的 `model_select` 选择，不记录启动时的默认模型、会话恢复、reload 或非 TUI 运行。Pi 的公开 hook 无法区分 `/model` 与其他扩展调用 `setModel()`，因此其他扩展造成的模型切换也可能被记录为一次选择。

## 发布与维护

当前版本为 **0.1.0**。本项目是原创项目，使用普通 SemVer 和 `v<版本>` tag，不虚构社区上游或 `upstream-main` 分支。`main` 是维护与发布主线，通过 PR 更新。

[GitHub Releases](https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases) 提供可安装包、`release-manifest.json` 来源清单和 `SHA256SUMS`；下载后先校验，再解压到永久目录安装。每版本发布流程见[维护说明](docs/releasing.md)。GitHub 发布不等于 npm 发布，也不会自动重载运行中的会话。

## 安装

从 GitHub 安装：

```bash
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.1.0
```

也可以在当前仓库临时加载：

```bash
pi -e ./src/index.ts
```

安装后重启 Pi。已有会话可以执行 `/reload` 重新加载扩展，但 `/reload` 本身不会触发模型恢复。

## 查看和清除

```text
/endpoint-model-memory status
/endpoint-model-memory forget
```

`status` 查看当前 endpoint 的记忆；`forget` 只删除当前 endpoint 的记录，不改变当前模型，也不修改 Pi 的全局默认。

单次关闭自动恢复：

```bash
pi --endpoint-model-memory off
```

## 存储与隐私

默认存储目录：

```text
<PI_CODING_AGENT_DIR>/endpoint-model-memory/
```

默认路径为：

```text
~/.pi/agent/endpoint-model-memory/
```

每个 endpoint 使用一个 SHA-256 文件。写入采用临时文件加原子 rename；同一个 endpoint 的并发写入以最后完成的原子写入为准，不会跨 endpoint 覆盖。

记录只包含：

- schema 版本；
- endpoint 摘要；
- provider；
- 模型 ID；
- 更新时间。

不会保存 API key、headers、prompt、会话内容或原始 URL。endpoint 身份根据 Pi 已解析模型目录中的配置 base URL、API 类型和 provider 计算；扩展不会执行 `!command`，也不会探测真实 API。

可以设置 `PI_CODING_AGENT_DIR` 改变整个 Pi 配置目录，从而改变存储位置。测试不会访问机器级全局存储。

## 要求

- Pi 0.99.1 或更高版本；
- Node.js 22.19 或更高版本；
- 仅使用 Pi 公共 Extension API。

## 开发与验证

```bash
npm install --ignore-scripts
npm run check
npm pack --dry-run --json
```

测试使用合成模型、临时目录和 provider-free 状态，不发送真实模型请求，也不读取生产凭据。

## 边界

本项目只负责“按 endpoint 记住最近模型”。它不负责：

- 模型健康检查；
- 自动 fallback；
- endpoint 重启；
- 凭据刷新；
- 改写全局 settings；
- 生产 API 验收。

## 许可证

MIT
