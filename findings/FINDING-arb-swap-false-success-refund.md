## FINDING: 兑换源链上链后 AI 误报「已换成 ETH」，实际订单 refunded 退款，需用户追问才暴露（issue 19，ARB + ETH 跨链复现）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 19（新增，待写入）
Project: CoWallet v2
Labels: RealDevice / Financial-Result-Misreport / Swap / Needs-Reverify
Priority: Medium
Source: 用户提供真机截图（app.getcowallet.wallet v1.0.2 build 2610141608；2026-10-15 13:42）
Screenshots:
- findings/assets/feishu-issue19-arb-refund/arb-10usdt-eth-refund.png（对话：先报「已换成 ETH」，追问后查订单=refunded 退款）
- findings/assets/feishu-issue19-arb-refund/eth-all-usdt-to-eth-refund-conv.png（Ethereum 主网 10.781667 USDT→ETH 真实执行：先报「兑换已完成/已上链」，追问「到账了吗」后承认 refund_complete 退款）

### 观察到

兑换 Arbitrum **10 USDT → ETH**：

1. AI 先回复：**「✓ 已确认：Arbitrum 上的10 USDT→ETH 已经上链。交易 0x7765cac5…」**
2. 随即直接宣称：**「兑换已执行 ✓ Arbitrum 上10 USDT 已换成 ETH。还要做点啥吗？」**
3. 用户追问**「兑换成功了吗」**→ AI 查订单（`kgr4eknk..rqru5t0`）后改口：
   > 没换成，USDT 已经原路退回。订单状态是 **refunded（refund_complete）**—源链那笔交易提交了，但兑换没完成，10 USDT 退回了你的 Arbitrum 钱包。

失败诱因（用户经验）：**滑点设为 0.5% 偏低**，订单兑换未完成被 Bridgers 退款；默认 **1%** 成功率更高。

**第 2 例（2026-10-15 14:48，Ethereum 主网，真实执行+Face ID 用户手动）**：输入「以太坊上 全部 USDT 换成 ETH」并真实执行：
计划 `35bf6c06` 执行（授权路由合约 0x498b..f9b2 / 兑换 0x018c3964...10ca88，已确认 34 个区块）。
AI 先报**「兑换已完成 — 卖出 10.781667 USDT，换成了 ETH，已完成。」**与**「已确认：Ethereum 上的 10.781667 USDT→ETH 已经上链。」**；
用户追问**「到账了吗？」**→ AI 改口**「这笔没换成 — 订单状态是已退款（refund_complete），USDT 已经退回你的钱包，ETH 没到账。」**。
→ 与第 1 例（ARB）同模式，**跨链复现（Arbitrum + Ethereum 主网）**：源链 tx confirmed 即误报成功、失败退款需用户主动追问才暴露；非 ARB 独有，属结果终态口径 + 主动通知的全局问题。

### 期望

- 结果卡/AI 回复不能只因源链 tx confirmed 就显示最终兑换成功；应在拿到 Bridgers 订单终态（success/refunded）后再下结论。
- 兑换失败退款应**主动**通知用户，而不是等用户追问。

### 影响

中。源链上链后即误报成功，用户可能误以为已持有 ETH；实际 USDT 已退回但需主动追问才发现。资金无损，主要是一致性与主动通知缺口。

### 复现步骤

1. wallet-ready（Arbitrum 有 10 USDT + 足够 ETH gas），App build 2610141608。
2. 发起兑换 Arbitrum 10 USDT → ETH（滑点设 0.5% 偏低时更易触发）。
3. 观察 AI 先报「已换成 ETH」；追问「兑换成功了吗」后才得知订单 refunded、USDT 已退回。
4. （第 2 例）Ethereum 主网 10.781667 USDT→ETH 真实执行后：AI 先报「兑换已完成/已上链」；追问「到账了吗」后才承认 refund_complete。

### 备注

- 与兑换覆盖指南「跨链/结果终态检查」一致：源链 tx confirmed ≠ 兑换成功。
- 滑点 0.5% vs 默认 1%：为失败诱因假设，需产品确认滑点默认值/可选项与失败退款主动通知机制。
- 已跨链复现（ARB 10USDT→ETH / ETH 主网 10.781667USDT→ETH），建议 issue 19 标题/结论升级为「非 ARB 独有」。
