# pi-endpoint-model-memory

[English](README.md) | 中文

一个 Pi 扩展，记住最后选择的完整 **provider + model**，同时校验 API endpoint 并保留各端点的独立历史。适合在 `codex-local` 等自定义渠道与 `zai-coding-cn` 等内置渠道之间切换。

本项目是独立的 Pi 扩展，不属于 `pi-subagents`、`pi-intercom` 或其他 Pi fork。

## 行为

在全新交互式 TUI 会话或 `/new` 中：

1. Pi 先按自身默认配置选定启动模型；
2. 扩展读取最后一次交互选择，包括渠道和模型；
3. 如果该模型仍在模型目录中、endpoint 与保存时一致、已配置认证且处于当前 scope，就恢复完整选择；
4. 无法恢复时，提示原因并保持 Pi 原来的选择，不退回某个旧渠道的历史模型。

例如，先选择 `codex-local/gpt-6.1-sol`，再选择 `zai-coding-cn/glm-5.3`，下次全新会话会恢复 `zai-coding-cn/glm-5.3`，而不是再次回到 `codex-local`。

各 endpoint 的历史仍然独立；跨渠道恢复必须匹配该模型保存时的 endpoint，不能把模型套到另一端点。

升级后如果还没有最后选择记录，旧版 0.1.0 的端点记录继续按原规则使用。加载更新后切换到想要的模型，就会开始记忆完整的渠道和模型；如果它已是当前模型，先切到其他模型再切回来，确保 Pi 发出选择事件。不会根据旧记录的时间戳猜测最后渠道。

## 选择优先级

以下情况保留 Pi 原有选择，不执行自动恢复：

- 显式指定 `--model`、`--models` 或 `--api-key`；
- 使用 `--continue`、`--resume`、`--session`、`--fork` 或已有会话；
- 执行 `/resume`、`/fork` 或 `/reload`；
- 非 TUI 运行。

只有全新的交互式会话，才会恢复最后选择的完整渠道和模型。Pi 1.3 要求 `--provider` 与 `--model` 一起使用（单独的 `--provider` 会被拒绝），此时属于显式选择，保留 Pi 的选择，不执行记忆恢复，也不会查询其他渠道。Pi 原生 `Ctrl+S` 仍然可以保存全局默认模型；本扩展不会改写 `settings.json`。

扩展只记录 TUI 中发生的 `model_select` 选择，不记录启动时的默认模型、扩展自己的自动恢复、会话恢复、reload 或非 TUI 运行。Pi 的公开 hook 无法区分 `/model` 与其他扩展调用 `setModel()`，因此其他扩展造成的模型切换也可能被记录为一次选择。

## 发布与维护

当前源码版本为 **0.3.0**，尚未打 tag 或发布；最近一次已发布版本是 **0.2.1**。本项目是原创项目，使用普通 SemVer 和 `v<版本>` tag，不虚构社区上游或 `upstream-main` 分支。`main` 是维护与发布主线，通过 PR 更新。

[GitHub Releases](https://github.com/chenhaoxiang/pi-endpoint-model-memory/releases) 提供可安装包、`release-manifest.json` 来源清单和 `SHA256SUMS`；下载后先校验，再解压到永久目录安装。每版本发布流程见[维护说明](docs/releasing.md)。GitHub 发布不等于 npm 发布，也不会自动重载运行中的会话。

## 安装

跨渠道恢复从 `v0.2.0` 开始提供；`v0.2.1` 进一步打包了 `status` 中的会话内恢复或跳过原因，不改变模型选择和存储行为。已发布的 `v0.1.0` 仍只按端点恢复。`0.3.0` 保持上述行为不变，只把 Pi 基线提升到 `1.3.0-fork.1`。固定新版本安装：

```bash
pi install git:github.com/chenhaoxiang/pi-endpoint-model-memory@v0.2.1
```

可以在当前候选仓库临时加载修复，不修改全局安装（维护中的 `@main` 现已要求 Pi `1.3.0-fork.1` 或更新版本，下一个源码版本为 `0.3.0`；`v0.2.1` 是最后一个支持 Pi 0.99.1 的版本）：

```bash
pi -e ./src/index.ts
```

安装后重启 Pi。已有会话可以执行 `/reload` 重新加载扩展，但 `/reload` 本身不会触发模型恢复。

## 查看和清除

```text
/endpoint-model-memory status
/endpoint-model-memory forget
```

`status` 同时显示当前 endpoint 的记忆、全局最后选择的渠道/模型，以及本会话最近一次恢复或跳过的固定原因（只在内存保留）；`forget` 删除当前 endpoint 的记录，如果最后选择也指向该 endpoint，则一并清除。不改变当前模型，也不修改 Pi 的全局默认。最后选择记录损坏或不可读时，仍可查看和删除合法的端点记录；损坏文件保留原字节，并明确提示最后选择未能核对或清除。

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

每个 endpoint 使用一个 SHA-256 文件，另用 `last-selection.json` 保存完整的最后选择。两种记录都采用私有临时文件加原子 rename；同一进程内的选择按顺序写入，跨进程以每个文件最后完成的原子写入为准。恢复以最后选择记录为准，旧端点历史不会覆盖它；两个文件不构成跨文件事务。

记录只包含：

- schema 版本；
- endpoint 摘要；
- provider；
- 模型 ID；
- 更新时间。

不会保存 API key、headers、prompt、会话内容或原始 URL。endpoint 身份根据 Pi 已解析模型目录中的配置 base URL、API 类型和 provider 计算；扩展不会执行 `!command`，也不会探测真实 API。

可以设置 `PI_CODING_AGENT_DIR` 改变整个 Pi 配置目录，从而改变存储位置。测试不会访问机器级全局存储。

## 要求

- Pi `1.3.0-fork.1` 或更高版本（维护中的 `chenhaoxiang/pi` fork）。Pi 0.99.x 不再作为开发或支持基线；
- Node.js 22.19 或更高版本；
- 仅使用 Pi 公共 Extension API。

## 开发与验证

```bash
npm ci --ignore-scripts
npm run check
npm pack --dry-run --json
```

`devDependencies` 和根 `overrides` 固定引用 `chenhaoxiang/pi` `v1.3.0-fork.1` 的不可变公开发布制品；锁文件记录其 URL 与完整性哈希，因此不需要本机绝对路径。维护版 SDK 制品不含 `npm-shrinkwrap.json`，且 fork 子包未发布到 npm，所以由根 `overrides` 从同一 Release 解析。npm 只在当前仓库应用根 `overrides`，不会约束安装本扩展的用户。

`npm test`（以及包含它的 `npm run check`）会经由 `scripts/test-isolated.mjs` 启动。在任何测试进程出现之前，它先在 `tmp/test-isolation/` 下创建自有 fixture，把 `HOME`、`PI_CODING_AGENT_DIR`、`XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME`/`XDG_STATE_HOME` 和 `TMPDIR` 指向该目录，并且只传递 `PATH`、区域设置和平台系统键。因此继承的凭据、Pi 覆盖项、`NODE_OPTIONS` 和 `npm_*` 都不会进入测试，Google ADC 探测也只落在 fixture 内。包装器只输出传递的键名与固定标签，写出 `tmp/verification/test-isolation-receipt.json`（命令、SDK 版本、`homeIsRealHome: false`、清理结果），且仅当归属标记匹配时才删除 fixture。若绕过该包装器直接运行测试，`test/isolation.test.ts` 会失败，请使用 `npm test`。

测试使用合成模型、临时目录和 provider-free 状态，不发送真实模型请求，也不读取生产凭据。

## 边界

本项目只负责“记住最后选择的渠道和模型，并保留端点历史”。它不负责：

- 模型健康检查；
- 自动 fallback；
- endpoint 重启；
- 凭据刷新；
- 改写全局 settings；
- 生产 API 验收。

## 许可证

MIT
