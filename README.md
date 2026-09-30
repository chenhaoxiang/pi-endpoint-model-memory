# pi-endpoint-model-memory

按 Pi 的 **provider + API endpoint** 记住最近选择的模型。适合同时使用多个 OpenAI-compatible / Responses API 端点，例如 `codex-local` 与 `codex-local-8319`。

## 行为

在全新交互式 TUI 会话或 `/new` 中：

1. Pi 先按自己的默认配置选定一个 provider/endpoint；
2. 扩展只查这个 endpoint 的记忆；
3. 如果有同 endpoint、当前仍可用且在当前 scope 内的历史模型，就恢复它；
4. 没有可用历史时保持 Pi 原来的选择。

不同端点完全隔离，不会因为另一个端点最近使用了某个模型而切换线路。

### 优先级

- 显式 `--model`、`--models` 或 `--api-key`：保留 Pi 的显式选择；
- `--continue`、`--resume`、`--session`、`--fork` 或已有会话：保留会话自身模型；
- `/resume`、`/fork`、`/reload`：不自动应用 endpoint memory；
- 新会话：才应用对应 endpoint 的最近模型；
- Pi 原生 `Ctrl+S` 仍可保存全局默认，本扩展不会改写 `settings.json`。

扩展只记录 TUI 中发生的 `model_select` 选择，不记录启动默认值、会话恢复、reload 或非 TUI 运行。Pi 的公共 hook 无法区分 `/model` 与其他扩展调用 `setModel()`；因此其他扩展造成的模型切换也会被视为选择记录。

## 安装

从 GitHub 安装：

```bash
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory
```

或当前仓库临时加载：

```bash
pi -e ./src/index.ts
```

安装后重启 Pi；已有会话可执行 `/reload` 重新加载扩展，但 `/reload` 本身不会触发模型恢复。

## 查看和清除

```text
/endpoint-model-memory status
/endpoint-model-memory forget
```

`forget` 只删除当前端点的记忆，不改变当前模型，也不改变 Pi 的全局默认。

单次关闭自动行为：

```bash
pi --endpoint-model-memory off
```

## 存储与隐私

默认存储目录：

```text
<PI_CODING_AGENT_DIR>/endpoint-model-memory/
```

默认即 `~/.pi/agent/endpoint-model-memory/`。每个 endpoint 一个 SHA-256 文件，写入采用临时文件 + 原子 rename；同一 endpoint 的并发写入按最后完成的原子写入取胜，不会跨端点覆盖。

文件只包含：schema 版本、endpoint 摘要、provider、模型 ID、更新时间。不会保存 API key、headers、prompt、会话内容或原始 URL。endpoint 身份使用 Pi 已解析模型目录中的配置 base URL、API 类型和 provider 计算；不执行 `!command`，不探测真实 API。

可用 `PI_CODING_AGENT_DIR` 改变整个 Pi 配置目录，从而改变存储位置。测试不访问机器全局存储。

## 要求

- Pi 0.99.1 或更高版本；
- Node.js 22.19+（Pi 运行时要求）；
- 仅使用 Pi 公共 Extension API。

## 开发

```bash
npm install --ignore-scripts
npm run check
npm pack --dry-run --json
```

测试使用合成模型、临时目录和 provider-free 状态，不发送真实模型请求，也不读取生产凭据。

## 边界

本项目只负责“按端点记住最近模型”。它不做模型健康检查、自动 fallback、端点重启、凭据刷新、全局 settings 改写或生产 API 验收。

## License

MIT
