## FINDING: 设置恢复密码页输入密码后「保存备份」按钮被软键盘遮挡

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 13（record reczz28N6cZfwRMt）
Project: CoWallet v2
Labels: Bug
Priority: Medium
Source: iOS 真机 T05c 创建钱包流程（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- ../reports/2026-10-14T00-22-22-783Z-t05c-set-recovery-password-ios/summary.json
- ../reports/2026-10-14T00-23-50-905Z-t05c-set-recovery-password-ios/summary.json
Screenshots: （Midscene HTML 报告内嵌，见「T05c 已填恢复密码」「T05c 保存备份后」步骤）

### 观察到

「设置恢复密码」页输入两个密码框后，iOS 软键盘（无 Done/Return 收起键）遮挡了页面下方的「保存备份」按钮，自动点按「保存备份」定位失败（`TaskExecutionError: cannot find search area for "保存备份"`）。需先收起键盘才能点到按钮。

### 期望

填完密码后，「保存备份」按钮应可正常点按，不应被键盘长期遮挡；或页面应随键盘出现自动滚动到可操作区域。

### 影响

中。既影响自动化测试，也可能影响真实用户：iOS 密码键盘无 Done/Return 收起键时，填完密码后提交按钮可能被键盘遮住，用户需手动收起键盘才能提交，流程不够顺畅。

### 复现步骤

1. 创建钱包 → 设置恢复密码页。
2. 分别填入两个密码框（键盘弹出）。
3. 观察：页面下方的「保存备份」按钮被键盘遮挡，无法直接点按。

### 备注

- 已写入飞书 Issue list（序号 13，附 4 张截图）。
- 自动化侧解决：输入后先收起键盘再点「保存备份」（脚本已内置 dismissKeyboard）。
