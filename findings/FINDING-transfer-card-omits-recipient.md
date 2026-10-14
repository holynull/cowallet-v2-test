## FINDING: 转账确认卡不显示完整收款地址，只能输入尾 4 字符核对

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 14（新增）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机 T19 真实转账流程（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- reports/2026-10-14T03-19-40-798Z-t19-real-transfer-eth-ios/summary.json
- reports/2026-10-14T03-19-40-798Z-t19-real-transfer-eth-ios/report/*.html
Screenshots:
- findings/assets/feishu-issue14-confirm-card/t19-card-chat-shows-addr.jpg（聊天消息展示完整地址 0x7527…D767B）
- findings/assets/feishu-issue14-confirm-card/t19-card-no-addr-on-card.jpg（确认卡正文不渲染地址值，仅显示「请输入上面地址的最后 4 个字符才能批准」）

### 观察到

对「向 0x75276A6E673B4083b640956262605955F11D767B 转 0.0005 ETH」的真实转账，确认卡正文只显示「你粘贴或输入的地址」标签 + 输入框提示「请输入上面地址的最后 4 个字符才能批准」，**卡片本身不渲染完整的收款地址值**。双重防护 = 输入地址尾 4 字符 + Face ID 批准。

### 期望

确认卡应直接展示收款地址（或其可展开/可复制的完整形式），让用户在批准前能在卡上直接核对收款地址。

### 影响

中。若包含地址的聊天消息已滚出屏幕，用户在批准前无法在确认卡上核对收款地址，只能依赖输入尾 4 字符的一致性判断，存在转错地址的安全 UX 隐患。尾 4 字符 + Face ID 的双重防护本身是好的，但卡上缺地址值降低了可核对性。

### 复现步骤

1. 钱包已就绪，向任意地址发起转账。
2. AI 生成确认卡。
3. 观察：确认卡正文没有完整地址，只有「请输入上面地址的最后 4 个字符才能批准」。

### 备注

- 首次脚本断言 `recipient-matches-authorized` 误报 failed-address-mismatch（aiQuery 读不到卡上地址，`recipientOnCard: null`），经 OCR 核实聊天消息里地址为 0x75276A6E673B4083b640956262605955F11D767B，确认卡正文确实不渲染地址值——脚本误报排除后确认为产品行为。
- 已写入飞书 Issue list（序号 14，附 2 张截图）。
