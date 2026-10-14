## FINDING: 邮箱验证码发送有每小时 3 次限流，短时间多次触发后无法继续登录

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 12（record reczz28Mng3yXBAW）
Project: CoWallet v2
Labels: Behavior / Info
Priority: Low
Source: iOS 真机 T04 注册流程（app.getcowallet.wallet v1.0.2 build 2610121802）
Source report:
- ../reports/2026-10-13T06-41-50-349Z-t04-register-send/summary.json
Screenshots: （见对应 Midscene HTML 报告）

### 观察到

- 连续多次触发邮箱验证码发送后，点「继续」按钮先进入**加载态**（按钮文字消失、显示加载图标），随后停留在登录页并提示：
  `验证码发送太频繁，请稍后再试（每小时最多3次）`
- 此时不会进入 OTP 输入页，用户无法继续登录，需等待额度恢复。

### 期望

- 限流本身是合理的防滥用安全设计；但希望确认：
  1. 触发限流后「继续」按钮的加载态是否会误导用户以为请求还在处理（实测停留在加载态较久后出现错误提示，反馈链路较长）；
  2. 是否有更明确的倒计时/可再次尝试时间提示。

### 影响

低。属于安全保护行为，不影响资金/密钥安全。对测试影响：频繁重登会触发限流，单小时最多 3 次验证码发送，自动化重登流程需要控制频率。

### 复现步骤

1. 在邮箱登录页输入邮箱，点「继续」触发验证码。
2. 短时间（1 小时内）累计发送超过 3 次。
3. 再次点「继续」，观察：按钮进入加载态后停留在登录页，提示「验证码发送太频繁，请稍后再试（每小时最多3次）」。

### 备注

- 已写入飞书 Issue list（序号 12）。
