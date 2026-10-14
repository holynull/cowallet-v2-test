## FINDING: 分片表述一致性（issue 4）回归——2026-10-14 验收通过

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 4（回归验收，record reczz28MNNXaNJAh）
Project: CoWallet v2
Labels: Regression
Priority: Medium
Source: iOS 真机 T21 只读回归（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- reports/2026-10-14T04-08-05-217Z-t21-shard-naming-regression-ios/summary.json
Screenshots:
- findings/assets/feishu-issue4-regression/t21-settings-three-keys.png（设置「三份钥匙」页）
- findings/assets/feishu-issue4-regression/t21-ai-shard-answer.png（AI 对「我的钱包密钥分片存在哪里」的回答）

### 观察到（回归通过）

对照设置「密钥检查 → 三份钥匙」页与 AI 回答，两处分片位置表述**一致**，且不再有历史矛盾：

- 设置卡：「第 1 份 · 手机 — 存在手机安全芯片里（Secure Enclave / StrongBox）」、「第 2 份 · 服务器 — CoWallet 服务器 · 加密存储」、「第 3 份 · 你保管 — 你抄下的 24 个助记词，和用恢复密码加密的备份」；三份数量 3。
- AI 回答：「你的钥匙被拆成三份…… ①手机份—存在这台 iPhone 的安全芯片（Secure Enclave）里…… ②服务器份—加密存在 CoWallet 服务器（亚马逊 AWS 的硬件隔离环境 Nitro Enclave）里…… ③你自己保管的备份—就是你抄下的那 24 个词。用它加密的备份在这台手机的钥匙串里…… 服务器上也有份用你 24 个词加密的副本……」
- 关键：AI **明确说「服务器份—加密存在 CoWallet 服务器」**，与设置卡「第 2 份 · 服务器」一致；此前 issue 4 记录的「我们这边不存你的分片，也没有第三片存在任何服务器上」矛盾表述**未再出现**。

### 与 issue 4 的关系

issue 4 原证据：设置卡叫「第 1 份·手机 / 第 2 份·服务器 / 第 3 份·你保管」，AI 答成「本机分片 / 云备份分片 / 恢复分片」并称无服务器分片，直接冲突。本次回归：AI 表述改为「手机份 / 服务器份 / 你自己保管的备份」，与设置卡位置一一对应且明确承认服务器分片，**矛盾已消除**。文档标注「已修复」，本回归确认修复在该构建上成立。

### 影响

用户对分片存放位置的理解与设置页一致，不再怀疑服务器是否持有分片，备份/恢复信任感恢复。

### 复现步骤（回归路径）

1. wallet-ready → 设置 → 密钥检查 → 三份钥匙：读取分片表述。
2. AI 对话问「我的钱包密钥分片存在哪里？」。
3. 对照：数量 3、位置（手机/服务器/你保管）一致、AI 不再否认服务器分片。

### 备注

- 两处措辞仍非逐字一致（「第 1 份 · 手机」vs「手机份」），但不构成矛盾，建议后续可统一文案更佳（非必改）。
- 已在飞书 issue 4 更新回归验证状态（已验收）并追加 2 张截图。
