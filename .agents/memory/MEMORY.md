# pi-ask 项目记忆索引

- [pi-ask 本地克隆与 rpc 无头模式](pi-ask-local-fork.md) — pi-ask 1.2.0 的 `ctx.mode !== "tui"` 门槛让 daemon 房间（`pi --mode rpc`）永远弹不出手机表单 → 改为本地 fork `fenlyin0420/pi-ask`（origin=fork / upstream=原仓库，main 镜像 / dev 定制，不提 PR，含 FORK.md）的 dev 分支（无构建步骤，直加载 TS）并新增 remote-headless 流程；clone 的 node_modules 必须保留；改完要 daemon restart 才生效；含 [[prefer-source-build-over-dist-patch]]
