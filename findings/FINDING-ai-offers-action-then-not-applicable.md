## FINDING: AI 提供「保护这台手机/让旧钥匙作废」选项，但选择后返回「无法生成计划（not_applicable）」——UX 死胡同

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 15（新增）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机只读回归（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- midscene_run/report/probe-rotate-ai2.html
- midscene_run/report/probe-rotate-protect.html / probe-rotate-ai-next.html
Screenshots:
- findings/assets/feishu-issue15/secure-this-phone-not-applicable.jpg

### 观察到

AI 对「我想轮换钱包密钥」先给出可点的澄清选项「旧手机被人碰过，想保护这台手机」（以及「只想做一次安全体检」），用户选择后：
- AI 先复述意图「旧手机可能被别人碰过，我想保护现在这台手机 / 让旧的那份作废」，
- 随后返回「无法生成计划 / 没法生成这个计划 / secure_this_phone does not apply to this wallet right now / 详情: not_applicable / 换个说法再试一次。」，
- 用户被导向「换个说法再试一次」，但没有说明为什么 not_applicable、也没有给出替代路径。

### 期望

- 若某动作当前不适用，AI 不应先把它作为可点选项提供给用户；或
- 返回 not_applicable 时应附带原因与可行替代路径（例如「当前没有旧设备分片需要作废；如需换新请走恢复钱包流程」），而不是只让用户「换个说法再试一次」。

### 影响

中。安全敏感场景下，用户被提供看似可用的安全动作，选择后却进入无法解释的死胡同（仅提示 not_applicable + 换个说法），对用户理解与信任有负面影响；也让自动化难以判断下一步。

### 复现步骤

1. wallet-ready → AI 对话 → 问「我想轮换钱包密钥，应该在哪里操作？」。
2. AI 给出三个选项。
3. 点「旧手机被人碰过，想保护这台手机」。
4. 观察：返回「无法生成计划 · not_applicable · 换个说法再试一次」，无原因、无替代路径。

### 备注

- 未触发任何执行边界（无签名/确认/作废）。
- 与 issue 3 回归联动；是否属产品预期（当前第 1 代无旧分片可作废）需产品确认，但「提供选项→无法执行且无解释」的 UX 本身是缺陷。
