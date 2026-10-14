## FINDING: 引导流程进度跨重启持久化，重开 App 不回欢迎首页

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 10（record reczz28Mln02wsVj）
Project: CoWallet v2
Labels: Improvement
Priority: Low
Source: iOS 真机 T01/T03（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- ../reports/2026-10-13T03-40-29-675Z-t01-smoke-ios/summary.json
- ../reports/2026-10-13T04-21-29-171Z-t03-unauthenticated-entry-ios/summary.json
Screenshots: （见 Midscene HTML 报告，首屏截图内嵌）
- ../reports/2026-10-13T04-21-29-171Z-t03-unauthenticated-entry-ios/report/*.html

### 观察到

- T01 首次启动：界面是欢迎引导页（「数字钱包 · 会听懂人话」＋「开始使用」＋「登录 / 恢复已有钱包」）。
- 点击「开始使用」进入「你的钱包如何保护你」介绍页后，脚本 terminate 并 relaunch App，重启后**没有**回到欢迎首页，而是停留在介绍页（「开始创建」＋「登录 / 恢复已有钱包」）。
- 后续多次 relaunch 均保持该进度，T03 全程起始状态一致为介绍页（fresh-install 判定仍成立）。

### 期望

重新打开 App 时，引导流程的进度是否应持久化取决于产品意图。若引导是"首次安装一次性流程"，用户中断后应能继续（当前行为合理）；但若期望每次回到引导首页/首屏，则当前行为属于偏离。两种解释下都建议明确：引导进度持久化是否在设计中，以及是否有"重新开始/重置引导"的路径。

### 影响

低。不影响安全边界（仍是 fresh-install 未登录态），但：
- 测试脚本起始状态判定需兼容"欢迎页"与"介绍页"两种 fresh-install 子页面；
- 若用户在中途退出引导，再次打开看不到首页营销内容，可能影响首次转化表达。

### 复现步骤

1. 全新安装（或清数据）后启动 cowallet。
2. 在欢迎页点「开始使用」。
3. 杀进程或 terminate 后重新打开 App。
4. 观察：进入的是「你的钱包如何保护你」介绍页，而非欢迎首页。

### 备注

- 需要产品/开发确认引导进度持久化是否预期行为后再决定是否转 Linear。
- 待补充：欢迎页→介绍页之间的完整引导步骤数；是否提供返回欢迎页的入口。
