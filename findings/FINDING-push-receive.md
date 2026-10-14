## FINDING: 收款到账无 PUSH/锁屏推送（issue 16）——锁屏/后台复测证实成立

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 16（回归验收，record reczz28NBqmNOyWh）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机 T29（app.getcowallet.wallet v1.0.2 build 2610132055，TestFlight 自动更新）
Source report:
- reports/2026-10-14T07-33-00-715Z-t29-push-receive-ios/summary.json（T29 锁屏 PUSH 复测）
- reports/2026-10-14T07-39-23-774Z-bell-check/（站内铃铛对照）
Screenshots:
- findings/assets/feishu-issue16/lockscreen-no-receive-push.png（锁屏/通知中心：无收款推送，仅 TestFlight 更新通知）
- findings/assets/feishu-issue16/home-bell-badge.png（首页右上角铃铛红点角标，总资产 $9.96）
- findings/assets/feishu-issue16/inapp-notification-center.png（站内通知「收到钱了 — 收到 0.0005 ETH（Ethereum）」）
- findings/assets/feishu-issue16/app-reopened-receive-page.png（重新打开 App 停在后台前所在页=收款页）

### 观察到（issue 16 成立）

真实外部地址 0xeaad…5137 向钱包 0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821 转入 **0.0005 ETH**（Ethereum 主网，多 RPC 确认链上余额 0.0034777 → 0.0039777 ETH）。App 后台化（按 Home）+ 设备保持解锁后：

- **锁屏/通知中心无任何「收到/到账」类资金 PUSH**。唯一 CoWallet 相关通知是 TestFlight 自动更新提示（「“CoWallet AI”已是最新版本 · 版本 1.0.2 (2610132055) 已自动下载并安装到你的设备上 · Jiayan Liu via TestFlight 4个通知」），非资金推送。
- **对照（站内通知存在）**：重新打开 App 停在后台前所在页（收款页）；首页右上角铃铛出现红色未读角标；站内通知中心显示「收到钱了 — 收到 0.0005 ETH（Ethereum）· 收款 · Ethereum · 0xeaad…5137 · 1分钟前」。
- **源码佐证**：`mobile/lib/services/push_service.dart` 的 `PushType` 枚举仅 `tx_confirmed / tx_failed / security_alert / mpc_sign_request`，无「收款到账」类型；`backend/api-server/src/routes/push.rs` 仅在 `mpc_sign_request` 时发送 push。→ 收款场景设计上就不会发 PUSH。

### 期望

用户锁屏/后台/未打开 App 时，收款到账应有 PUSH/锁屏推送（横幅 + 角标），与多数钱包的到账推送体验一致，而不是只有打开 App 才能看到站内铃铛角标。

### 影响

中。用户在锁屏/后台/未打开 App 时无法感知到账，需打开 App 并查看铃铛角标才能发现收款；重要收款可能被忽略。

### 复现步骤

1. wallet-ready，记录链上 ETH 余额。
2. 按 Home 后台化 App（设备保持解锁），由外部钱包向本钱包地址转 0.0005 ETH。
3. 等待链上到账（RPC 轮询确认余额增加）。
4. 下拉通知中心/锁屏查看：无「收到/到账」类资金推送（仅有系统/TestFlight 更新通知）。
5. 重新打开 App：停在后台前所在页；首页铃铛红点角标 + 站内通知中心有「收到钱了 0.0005 ETH」。

### 备注

- 测试期间 TestFlight 自动更新了 App build（2610121802 → 2610132055），锁屏通知中的「已是最新版本」为系统更新提示，非收款推送（已区分）。
- 已在飞书 issue 16 追加 4 张证据截图，回归验证状态置为「已验收」。
