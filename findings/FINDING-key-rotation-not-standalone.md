## FINDING: 密钥轮换回归（issue 3）——v2 无独立轮换按钮，secure_this_phone 返回 not_applicable

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 3（回归补证，record reczz28MNNXaNbKw）
Project: CoWallet v2
Labels: Regression
Priority: High
Source: iOS 真机只读回归（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- midscene_run/report/probe-rotate-ai2.html（AI 对「轮换密钥在哪里操作」的回答）
- midscene_run/report/probe-rotate-protect.html / probe-rotate-ai-next.html（选「保护这台手机」后）
Screenshots:
- findings/assets/feishu-issue3-rotate/t22-secure-this-phone-not-applicable.jpg

### 观察到

对「我想轮换钱包密钥，应该在哪里操作？」：
- AI 回答：「CoWallet 没有单独的『轮换密钥』按钮——三份钥匙换新只发生在恢复钱包的时候。你现在是哪种情况？」并给出三个选项：换机/手机丢了，要恢复钱包；旧手机被人碰过，想保护这台手机；只想做一次安全体检。
- 设置页（密钥检查/风险防护等）均无显式「轮换密钥」入口。

选「旧手机被人碰过，想保护这台手机」后，AI 复述意图「旧手机可能被别人碰过，我想保护现在这台手机 / 让旧的那份作废」后返回：
- **「无法生成计划」/「没法生成这个计划」/「secure_this_phone does not apply to this wallet right now」/「详情: not_applicable」/「换个说法再试一次。」**
- 未出现任何可执行的确认/签名/授权步骤（无执行边界）。

### 与 issue 3 的关系

issue 3 原证据为「轮换密钥失败」（v1 文档标注已修复）。本次回归：v2 已把密钥轮换重构为「仅通过恢复钱包发生」（AI 明确说明），无独立轮换按钮；针对「保护这台手机/让旧钥匙作废」的动作（secure_this_phone）在当前钱包状态下返回 not_applicable，未走到失败/成功分支。**不是崩溃式失败**，而是动作被状态门槛拒绝；是否产品预期需与产品确认（当前三份均为第 1 代、无旧分片可作废，not_applicable 可能合理）。

### 影响

安全关键流程（密钥作废/轮换）当前在 v2 中入口收敛到「恢复钱包」，且 secure_this_phone 返回 not_applicable。若用户确实需要作废旧手机分片，目前没有可用路径，只能等恢复流程；需产品确认这是否为预期限制。

### 复现步骤

1. wallet-ready → AI 对话 → 问「我想轮换钱包密钥，应该在哪里操作？」。
2. AI 回答无独立轮换按钮，并给出三选项。
3. 选「旧手机被人碰过，想保护这台手机」。
4. 观察：返回「无法生成计划 · secure_this_phone does not apply to this wallet right now · 详情: not_applicable」。

### 备注

- 无执行边界被触发，未进行任何签名/确认/作废动作。
- 另见 issue 15（AI 提供选项但无法执行，UX 死胡同）。
