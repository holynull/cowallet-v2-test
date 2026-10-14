## FINDING: 「换一个邮箱登录」页点返回会退回欢迎引导页，丢失 no-wallet 上下文

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 11（record reczz28MnOpxYS67）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机 T05（app.getcowallet.wallet v1.0.2 build 2610121802，email-registered-no-wallet 状态）
Source report:
- ../reports/2026-10-13T06-26-07-949Z-probe-change-email/summary.json
- ../reports/2026-10-13T06-26-55-383Z-verify-back-to-no-wallet/summary.json
Screenshots: （见对应 Midscene HTML 报告）

### 观察到

- 在「这个邮箱下没有钱包」页点「换一个邮箱登录」→ 进入「用邮箱登录」页（含「返回」「继续」）。
- 在该登录页点「返回」→ 不是回到「这个邮箱下没有钱包」页，而是**直接退回数字钱包欢迎引导页**（fresh-install 视角，未登录状态）。
- 再次进入需要重新走邮箱 + OTP 登录。

### 期望

「换邮箱登录」页的返回应回到上一级（「这个邮箱下没有钱包」页），保留已登录邮箱的上下文，而不是一步退到引导首页。

### 影响

中。用户从 no-wallet 页去换邮箱，改主意点返回，会被打回未登录引导页并丢失"当前邮箱无钱包"的上下文；需重新登录才能继续，导航路径不符合预期。

### 复现步骤

1. 用已注册但无钱包的邮箱登录，进入「这个邮箱下没有钱包」页。
2. 点「换一个邮箱登录」。
3. 在新登录页点左上角「返回」。
4. 观察：回到的是数字钱包欢迎引导页，而非 no-wallet 页。

### 备注

- 已写入飞书 Issue list（序号 11，附 2 张精确截图）。
