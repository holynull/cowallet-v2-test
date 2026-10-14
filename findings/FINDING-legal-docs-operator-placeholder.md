## FINDING: 服务条款 / 隐私政策中运营主体注册信息为占位文案

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 9（record reczz28MlmyE3tT6）
Project: CoWallet v2
Labels: Compliance
Priority: Medium
Source: iOS 真机 T15/T16（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- ../reports/2026-10-13T04-36-30-687Z-t15-guest-legal-pages-ios/summary.json
- ../reports/2026-10-13T04-43-15-309Z-t16-guest-language-switch-ios/summary.json
Screenshots: （见对应 Midscene HTML 报告，条款/隐私页正文内嵌截图）

### 观察到

- 「服务条款」正文开头：`……你与 CoWallet（运营主体的注册名称及注册地址以公司注册信息为准，确认后在此更新）（下称「我们」）之间的协议。`
- 「隐私政策」正文开头：`……由 CoWallet（运营主体的注册名称及注册地址以公司注册信息为准，确认后在此更新）运营（下称「我们」）。`
- 两处均为占位文案，未填写实际运营主体名称与注册地址；中文与英文版本都如此。

### 期望

法律文件的运营主体（注册名称 + 注册地址）应为真实、完整的信息；占位文案不应出现在用户可见的正式版本中。

### 影响

中。对含资金与潜在 KYC/合规要求的加密钱包，条款/隐私政策主体信息为空是合规风险：用户无法确认运营主体身份，涉及纠纷时责任主体不明确。

### 复现步骤

1. 在 fresh-install 引导页点「服务条款」或「隐私政策」。
2. 阅读正文开头，观察「（运营主体的注册名称及注册地址以公司注册信息为准，确认后在此更新）」占位文案。

### 备注

- 已写入飞书 Issue list（序号 9）。
