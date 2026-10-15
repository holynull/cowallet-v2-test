## FINDING: 新对话单条兑换请求出现两张并存「兑换计划」卡：旧卡自动被新卡取代但不清理，未点按钮即冒第二张卡（issue 21）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 21（新增，待写入）
Project: CoWallet v2
Labels: RealDevice / UX-Gap / Swap / Plan-Card
Priority: Medium
Source: 真机操作 + 屏幕实拍（app.getcowallet.wallet v1.0.2 build 2610141608；2026-10-15 14:14-14:18）
Screenshots:
- findings/assets/feishu-issue21-dual-plan-cards/old-card-expired-replaced.png（旧卡 c299acdf：「已被计划 a80e920f 取代 / 已过期」）
- findings/assets/feishu-issue21-dual-plan-cards/both-cards-transition.png（两张卡交接：旧卡过期 + 新卡「已更新：计划内容变了」）
- findings/assets/feishu-issue21-dual-plan-cards/current-active-card.png（新卡 a80e920f 当前生效，倒计时 + 取消/Face ID 批准）
- findings/assets/feishu-issue21-dual-plan-cards/history-3-sessions.png（会话历史 3 个会话，含新对话「Base 上的全部 USDC 换成 ETH」）

### 观察到

新开一个对话，仅输入并发送一条「**Base 上的全部 USDC 换成 ETH**」（**未点击任何刷新/再次报价/重试按钮**），对话内同时出现两张「兑换计划」卡：

- **旧卡 `c299acdf`**：标注「已被计划 `a80e920f` 取代 / 已过期」；
- **新卡 `a80e920f`**：当前生效（倒计时、签名额度、取消 / 用 Face ID 批准）。

会话历史确认：该新对话（标题「Base 上的全部 USDC 换成 ETH」，3 分钟前）与旧会话（op 上 10USDT 换 ETH）及幽灵会话（帮我转 0.01 ETH 给小明）并存，共 3 个会话。

### 期望

- 单条兑换请求只显示**一张**有效确认卡；报价被刷新/取代时，旧卡应被移除或折叠为一条提示，而不是两张完整确认卡并存。
- 未点击任何按钮时不应自动冒出新卡，或至少明确提示「报价已更新，旧卡已作废」并收起旧卡。

### 影响

低-中。兑换确认区双卡并存（一旧一新），用户需自行辨认哪张有效；旧卡仍是完整确认卡样式，存在误按/误读风险；「没点按钮就冒第二张卡」让用户疑惑是否已自动发起操作。不直接影响资金（旧卡已标过期、未自动执行）。

### 复现步骤

1. wallet-ready，App build 2610141608，新开一个对话。
2. 输入并发送「Base 上的全部 USDC 换成 ETH」（只发一次，不点任何按钮）。
3. 观察：对话内出现两张计划卡（旧 c299acdf 已过期 / 新 a80e920f 生效）。

### 备注

- 与 issue 19 观察到的「计划被取代/过期」同源；本单重点是「未点按钮自动冒第二张卡 + 旧卡不清理」。
