---
name: pi-ask-local-fork
description: pi-ask 改为本地克隆 dev 分支加载（含 rpc 无头 ask 流程补丁）；clone 的 node_modules 必须保留，否则所有房间扩展加载失败
metadata:
  type: project-fact
---

# pi-ask：本地克隆 + 源码改动（2026-09-27）

## 为什么

pi-ask 1.2.0 有两处硬门槛 `if (ctx.mode !== "tui") return 非交互降级`
（`src/ask-tool.ts`、`src/ui/controller.ts`），而 remote-pi 的 daemon 房间跑的是
`pi --mode rpc`（进程里有 `REMOTE_PI_DAEMON=1`）→ 手机端 ask 表单永远弹不出来，
remote-pi 那边现成的 `extension_ui_bridge`（started/submit/submit-result/completed
四件套 + App 端 `extension_ui_sheet.dart` 富表单）根本没机会触发。

## 现状

- 源码：`/home/fenlyin/Documents/GitHub/pi-ask` —— 已按 `git-fork-upstream-sync` 技能建 fork
  （`origin` = `fenlyin0420/pi-ask` 唯一 push 目标；`upstream` = `eko24ive/pi-ask` 只读）。
  `main` = 上游纯净镜像（`49482b7`，禁写）；`dev` = 定制线（2 个提交：`9fce333` 功能 + `854ef2d` 文档）。
  **没有构建步骤**，`package.json` 的 `pi.extensions` 直接指 `./src/index.ts`，Pi 用 jiti 加载 TS。
  `FORK.md`（`dev` 上）写清了定制内容、本机安装方式与同步上游的命令。
  **用户明确要求：不提 PR 给上游**（长期自用二次开发，按 fork 技能走）。
- 加载：`~/.pi/agent/settings.json` 的 `packages` 里是 `"git:github.com/fenlyin0420/pi-ask@dev"`
  （2026-10-14 从本地路径换成 GitHub 源，克隆在 `~/.pi/agent/git/github.com/fenlyin0420/pi-ask`，
  已 checkout `dev`）。改完要 push `dev` + `pi update --extensions` 才进 pi。
- 新增 `src/remote-headless.ts`：非 TUI 且有 remote runtime 时，走事件契约发
  `started`、await 一次 `submit`/`cancel`；10 分钟无应答
  （`PI_ASK_REMOTE_TIMEOUT_MS` 可覆盖）退回纯文本并 `completed`（后续 submit 收到
  `flow_not_found`），避免无人应答把 daemon 的 turn 永久挂住。
- 验证：`npm test`（209 过）+ `npx tsc` + `npx ultracite check` 全绿；还可用
  `pi --mode rpc` 喂 `{"type":"get_commands"}` 看 `ask-settings`/`answer` 的
  `sourceInfo.source` 是否指向本地路径来确认加载来源。

## 坑

- **clone 的 `node_modules` 必须留着**：`typebox`、`@earendil-works/pi-tui` 是
  peerDependencies，本地路径包只能从自己的 node_modules 解析（remote_pi/pi-extension
  同款做法）。删掉 → 所有房间扩展加载失败。
- devDeps 装了 pi-tui 0.84.1（比 remote_pi 那份 0.79.10 新）不影响：宿主对
  renderCall/renderResult 返回的对象是 duck-typing（全仓无 `instanceof Text`）。
- 改完要**重启对应 daemon**才生效（`node <repo>/pi-extension/dist/index.js daemon
  restart <id>`，id 见 `remote-pi daemons`）。重启自己的房间会杀掉当前会话，
  必须延迟+detached 执行（回复先落地）。
- 其余房间（remote_pi / Roleplay / fenlyin）用的是启动时加载的旧实例，各自重启后才生效。
- 升级姿势：`git fetch upstream` → 先 `git log main..upstream/main` 看差异 → `main` merge
  upstream 并 push → `dev` merge `main`（或单人时 rebase）。dev 只有两个提交，冲突面很小；
  没有 `npm i` 覆盖问题，也没有 dist 补丁。

## 关联

- [[prefer-source-build-over-dist-patch]] — 这条改动遵循的偏好
- [[pi-dist-patches-audit]] / [[remote-pi-extension-load-path]] — 同一类「本地路径包」先例

## 真机验证（2026-09-27）

- 用户确认：daemon 房间（Jarvis，`pi --mode rpc`）里 ask_user 的**富表单已能在手机端弹出并作答**
  → rpc 无头路径 + remote-pi 桥 + App `extension_ui_sheet.dart` 三段都通了。
- 连带发现：**收到表单但不弹通知**（App 侧触发集只有 `agent_done`/provider error）→ 已在
  App 侧修（见 [[remote-pi-background-notifications]] 的"触发集补上交互式请求"一节），
  随 beta `1.5.14-beta.1` 发布。
