## FINDING: 收款无消息提示（issue 1）——补充真机证据

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 1（补证，record reczz28MNNXaNcQw）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机 T19 前置余额核对（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- midscene_run/report/check-balance.html（首页余额核对 11:08-11:09）
- midscene_run/report/check-wallet-tab.html（钱包 tab 余额核对 11:09）
Screenshots:
- findings/assets/feishu-issue1-notify/t19-home-5.02-no-notify.jpg（首页总资产 $5.02，无任何到账提示）
- findings/assets/feishu-issue1-notify/t19-wallet-5.02-no-notify.jpg（钱包 tab 总资产 $5.02 · ETH 0.002000，无任何到账提示）

### 观察到

账户余额为 $5.02（ETH 0.002000）时，首页（「你的总资产 $5.02」）与钱包 tab（「总资产 $5.02 · ETH 0.002000」）均**没有任何到账/收款提示**，无横幅、无消息、无红点。用户只能自行打开资产页核对余额确认到账。与 issue 1「收款没有任何消息提示」一致。

### 期望

收款到账后应有明确反馈（推送/站内消息/横幅），至少让用户知道「有一笔资金到账」。

### 影响

中。用户收款后没有任何反馈，无法确认是否到账，需要自行去资产页核对余额。

### 复现步骤

1. 钱包已就绪，从外部地址转入 ETH（本机此前已收到 $5.02）。
2. 打开首页与钱包 tab。
3. 观察：余额已更新但无任何到账提示。

### 备注

- 已在飞书 issue 1 补充 2 张真机截图证据。
