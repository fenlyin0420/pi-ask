# 这个 fork 的自定义线（`dev`）

- `origin` = 本 fork（唯一 push 目标），`upstream` = `eko24ive/pi-ask`（只读，不提 PR）。
- `main` 是上游纯净镜像，**不要在它上面写任何东西**；所有定制只在 `dev`。
- 改动尽量收在新增文件里，减少与上游的重叠面；无法避免时在下面记清触及的文件。

## `dev` 上有什么

### `feat: answer ask_user headlessly on non-terminal hosts`

新增 `src/remote-headless.ts`，另有 `ask-tool.ts` / `ask-tool-helpers.ts` /
`constants/text.ts` / `ui/controller.ts` 四处小改。

原因：pi-ask 原本在 `ctx.mode !== "tui"` 时直接退化成纯文本，而跑 `pi --mode rpc` 的远程宿主
（例如 remote-pi 的 daemon 房间）**永远不会**是 `tui`，于是手机端永远弹不出表单。
现在非 TUI 且有 remote runtime 时改走 pi-ask 自己的事件契约：发 `started`，等一次
`submit`/`cancel`，收工；10 分钟无人应答则退回文本并结束流程（`PI_ASK_REMOTE_TIMEOUT_MS` 可覆盖），
避免无人应答把 agent 的回合永久挂住。

### `feat: optional note on the review tab`

Review 页在 `Cancel` 之后多一行 `Optional note:`（方向键可达，回车打开 note 编辑器，
复用 `noteEditor` 键位），可以留空；提交后作为 `details.note`（顶层，与每题的
`answers[*].note` 区分）返回，并出现在 summary / transcript / elaboration 文本里。

冲突面：`types.ts`、`constants/{text,ui}.ts`、`state/{view,navigation,transitions,editor,result}.ts`、
`result-format.ts`、`ui/{render,render-submit,view-models/review,input,controller,dismiss-guard,auto-submit}.ts`。
上游改动这些文件时优先手抄上游逻辑，再把这行注记接回去。

## 本机安装方式

`~/.pi/agent/settings.json` 的 `packages` 里用**本地路径包**指向本仓库，而不是 `npm:@eko24ive/pi-ask`。

- **clone 里的 `node_modules` 必须保留**：`typebox`、`@earendil-works/pi-tui` 是 peerDependencies，
  本地路径包只能从自己的 `node_modules` 解析；删掉会让所有 pi 房间的扩展加载失败。
- 没有构建步骤：`package.json` 的 `pi.extensions` 直接指向 `./src/index.ts`，Pi 用 jiti 加载 TS。
  改完源码**重启对应 daemon** 才生效。

## 同步上游

```bash
git fetch upstream
git log main..upstream/main        # 先看上游改了什么，再决定合并
git checkout main && git merge upstream/main && git push origin main
git checkout dev && git merge main && git push origin dev
```

单人维护、`dev` 只有一个提交，冲突面很小。上游发新版时优先把 `dev` rebase 到新的
`upstream/main`（rebase 会改写提交号，确认没别人基于 `dev` 干活再动）。

## 验证

```bash
npm test                          # node --test，209 个用例
npx tsc -p tsconfig.json          # 类型检查
npx ultracite check               # lint/format
```

devDependencies 不随仓库分发，需要跑上面三条时先装一次：

```bash
npm install --no-save typescript typebox @types/node \
  @earendil-works/pi-coding-agent @earendil-works/pi-tui @earendil-works/pi-ai
```
