## FINDING: OP 兑换失败错误文案堆叠 + 直接暴露「服务器错误，状态码：502」，无重试/替代引导（issue 18）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 18（新增，待写入）
Project: CoWallet v2
Labels: RealDevice / UX-Gap / Error-Handling
Priority: Medium
Source: 用户提供真机截图（app.getcowallet.wallet v1.0.2 build 2610141608；2026-10-15 13:31）
Screenshots:
- findings/assets/feishu-issue18-swap-502/op-swap-10usdt-502.png（对话：Op 上 10USDT 换 ETH → 4 段错误文案；同屏 arb 0.0045ETH 换 USDT 正常）

### 观察到

AI 聊天输入「**Op 上 10USDT 换 ETH**」后，助手一次性返回 4 段堆叠错误文案：

> 无法生成计划
> 没法生成这个计划
> 服务器错误，状态码：502
> 暂时没有可用的兑换路线，稍后再试。

- 直接暴露后端原始 HTTP 状态码 **502** 给用户；
- 多段文案语义重复且矛盾（「服务器错误」vs「没有可用的兑换路线」）；
- 无重试按钮 / 替代路径，用户只能重新输入。

同屏对照组「arb 上的 0.0045ETH 换 USDT」：正常「已提议，请看屏幕上的确认卡片」→ 确认卡 →「兑换计划 / 已发出，等链上确认」。→ 非全链路故障，属失败态文案/UX 问题。

### 期望

- 兑换失败只给**一条**可理解的失败文案，区分「余额不足 / 无可用路线 / 服务暂不可用（请稍后重试）」；
- 不暴露后端状态码/内部错误细节；
- 提供重试按钮或明确下一步引导。

### 影响

中。失败时用户收到无法理解的错误堆叠（含原始 502），无法判断是余额/路线/服务器问题，也无直接重试出口；服务端瞬时故障可能被误读为「没有可兑换路线」。

### 复现步骤

1. wallet-ready，App build 2610141608。
2. AI 聊天输入「Op 上 10USDT 换 ETH」。
3. 观察助手回复：4 段堆叠文案，含「服务器错误，状态码：502」。

### 备注

- 与兑换覆盖指南失败态用例（F-3/F-5/F-7）期望一致：失败文案应可理解、失败应有出口。
- 已写入飞书 Base issue 18（待反馈/待确认）。
