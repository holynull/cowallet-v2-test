## FINDING: ETH 转账（issue 5）回归——2026-10-14 真实转账全链路成功

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 5（回归补证，record reczz28MNNXaMD4s）
Project: CoWallet v2
Labels: Regression / Bug
Priority: High
Source: iOS 真机 T19 真实转账流程（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- reports/2026-10-14T03-19-40-798Z-t19-real-transfer-eth-ios/summary.json
- midscene_run/report/balance-after-transfer.html（执行进度卡 + 转账后钱包页）
- midscene_run/report/verify-transfer-result.html
Screenshots:
- findings/assets/feishu-issue5-regression/t19-transfer-confirmed-tx-0x31af.jpg（执行进度「已确认（0 个区块）· 0.0005 ETH · 交易 0x31af0845…1480fa」）
- findings/assets/feishu-issue5-regression/t19-wallet-after-0.001478.jpg（转账后总资产 $3.72 · ETH 0.001478）

### 观察到

用户明确授权的一笔真实转账（收款地址 0x75276A6E673B4083b640956262605955F11D767B，已写入 .env TEST_SAFE_EVM_RECEIVER，金额 0.0005 ETH · Ethereum 主网）：

- 确认卡：金额「≤ 0.00052815 ETH」、网络 Ethereum、手续费「最多 0.00002815 ETH（当前约 0.00002226）」，与预估吻合。
- 签名并广播：Face ID 由用户手动完成。
- 结果：**已确认（0 个区块）**，交易 `0x31af0845b765b36cc2d3db9a1471cfe42b24280c1af01fd78713e059561480fa`（Ethereum · 10/14 11:31）。
- 余额核对：0.002000 → 0.001478 ETH（0.0005 + ~0.000022 gas，与卡片预估吻合）；总资产 $5.03 → $3.72。

### 与 issue 5 的关系

issue 5「ETH 转账失败」原始证据为 RPC（1rpc.io 免费额度用尽）导致 `chain_unreachable` 卡片与 AI 回复矛盾。本次回归在 RPC 正常的前提下，**转账全链路成功**：卡片生成 → 尾 4 字符 + Face ID → 广播 → 链上确认 → 余额扣减一致。原始 issue 描述的 RPC 异常场景本轮未复现。

### 影响

转账主路径当前可用。issue 5 归因应更精确：不是「转账功能失败」，而是「RPC/后端链上数据不可用时的状态一致性」问题；该异常路径仍需在 RPC 故障时复测。

### 复现步骤

1. 钱包已就绪且余额 ≥ 0.0005 ETH。
2. 向 0x7527…D767B 发起「转 0.0005 ETH」。
3. 确认卡 → 输入地址尾 4 字符 → Face ID（用户手动）→ 广播。
4. 链上已确认，余额 0.002000 → 0.001478 ETH。

### 备注

- 真实资金已移动，金额在测试上限内，收款方为用户指定的安全测试地址。
- 已在飞书 issue 5 补充回归证据与回归备注（见表格记录）。
