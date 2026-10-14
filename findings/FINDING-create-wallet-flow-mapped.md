## FINDING: 创建钱包流程 UI 走向已完整探明，备份方式选择页是助记词边界前最后一步

Status: local-draft
Linear: pending
Project: CoWallet v2
Labels: Info / Test-Complete
Priority: None
Source: iOS 真机 T05b/T05c（app.getcowallet.wallet v1.0.2 build 2610121802，email-registered-no-wallet）
Source report:
- ../reports/2026-10-14T00-15-08-807Z-t05b-create-wallet-ios/summary.json
- ../reports/2026-10-14T00-34-28-865Z-save-backup-probe/summary.json
Screenshots: （见对应 Midscene HTML 报告）

### 观察到

创建钱包（email-registered-no-wallet → 创建钱包）完整 UI 走向：

| 步骤 | 页面 | 关键内容 |
| --- | --- | --- |
| 0 | 创建钱包说明页 | AI 消息 + 5 步说明（生成密钥 / Face ID / 恢复密码 / 保存备份 / 记下24助记词）+「创建钱包」 |
| 1 | 系统 Face ID 权限弹窗 | 「允许」CoWallet AI 使用面容ID |
| 2 | 面容ID 验证页 | 真人 Face ID 验证 |
| 3 | 设置恢复密码页 | 恢复密码 + 再输一次 + 保存备份 + 取消；**密码最少 10 字符**；两次不一致有提示「两次输入的密码不一致」 |
| 4 | 备份方式选择页 | 「恢复密码已设好，备份已存在这台手机的钥匙串里」；二选一：「点按显示」（24助记词）/「导出备份文件」 |
| （后续） | 24 助记词展示 / 备份文件导出 | **= 密钥硬边界，未进入** |

### 期望

记录创建钱包流程走向，确认安全提示是否充分。

### 影响

- 安全提示做得好：恢复密码页明确「CoWallet 和任何客服都不会向你要 24 个助记词、恢复密码、邮箱验证码、备份文件、导出文件或它的口令，也不会让你把钱转到'安全地址'」；备份页说明服务器副本用 24 助记词加密、任何人（含 CoWallet）无词打不开。
- 恢复密码最少 10 字符的强度校验有效（123456 被拒，提示「至少要 10 个字符」）。
- 测试至此为止：脚本停在备份方式选择页，未点击「点按显示」（会展示助记词）或「导出备份文件」（会导出敏感备份），未截屏/记录任何助记词。

### 复现步骤

1. 已注册无钱包邮箱登录 → 点「用这个邮箱创建新钱包」。
2. 依次：允许 Face ID → 人脸验证 → 设置恢复密码（≥10 字符两次一致）→ 保存备份。
3. 观察：到达备份方式选择页（助记词 / 导出备份文件二选一）。

### 备注

- 本 finding 是流程记录，不构成缺陷；用于 T06+（wallet-ready 用例）的前置路径参考。
- 测试密码已存 .env TEST_WALLET_PASSWORD（git-ignored，不落报告）。测试钱包若不需要保留，需按流程清理。
