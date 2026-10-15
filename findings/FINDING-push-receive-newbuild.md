## FINDING: 新 TestFlight build 收款到账已出现系统级推送（issue 16 反转信号，待后台/锁屏复测确认）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 16（关联；本轮仅本地记录，未改飞书状态）
Project: CoWallet v2
Labels: RealDevice / Regression-Rebound / Needs-Reverify
Priority: Medium
Source: 用户提供的真机截图（App 已更新到最新 TestFlight build；build 号待设备解锁后确认，此前为 v1.0.2 build 2610132055）
Screenshots:
- findings/assets/feishu-issue16-newbuild-push/receive-push-banner.jpg（09:38，推送横幅「收到 1 USDT（Ethereum）/ 0xf779…c589 / 点一下看这笔」叠加在 App 收款页之上）

### 背景

issue 16（旧 build 2610132055）经 T29 实测：真实外部转入后，**后台/锁屏无资金 PUSH**，仅有站内铃铛（首页角标 + 通知中心），源码佐证 `push_service.dart` 的 `PushType` 无「收款到账」类型、`push.rs` 仅 `mpc_sign_request` 发 push → 当时判定「收款场景设计上不会发 PUSH」，飞书状态=已验收。

本轮用户把 App 更新到**最新 TestFlight build**，在收款页（App 前台）收到 `1 USDT（Ethereum）` 后，出现了**系统级推送横幅**。

### 观察到

- 推送横幅：标题「**收到 1 USDT（Ethereum）**」，来源地址 `0xf779…c589`，动作文案「**点一下看这笔**」。
- 出现场景：App 停在**收款页（前台）**，横幅浮于页面顶部；页面可见 6 条支持链（ETH/Base/Arb/OP/BSC/Polygon）、复制地址、我有多少钱/转账/兑换等。
- 与旧 build 的差异：旧 build 同一收款场景（T29，后台化+锁屏）只有 TestFlight 更新通知 + 站内铃铛；新 build 已出现「收款到账」类推送（至少前台横幅存在）。

### 期望

收款到账在锁屏/后台/未打开 App 时也应有 PUSH（横幅 + 角标），与多数钱包一致——即 issue 16 的诉求。新 build 若已补全，则 issue 16 应转「已修复」。

### 影响

若完整生效，用户无需打开 App 即可感知到账，issue 16 缺陷消失；若仅前台横幅、后台/锁屏仍无，则为部分修复。

### 复现/待确认（结论前置）

1. 确认设备上新 build 号（当前设备锁屏，`xcrun devicectl` 显示 unavailable，待解锁读取 `CFBundleVersion`）。
2. 在新 build 上重跑一次 T29 式复测：外部地址真实小额转入 → **按 Home 后台化 + 锁屏** → 查锁屏/通知中心是否有「收到」类推送（区别于 TestFlight 更新通知）。
3. 通过 → 更新飞书 issue 16 为「已修复 / 待反馈」；不通过（仅前台横幅）→ 记录为部分修复并补证据。

### 备注

- 本轮仅按用户指示本地记录，未改动飞书 Base issue 16 状态；截图已归档到 `findings/assets/feishu-issue16-newbuild-push/`。
