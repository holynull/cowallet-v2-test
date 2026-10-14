## FINDING: 真实执行密钥轮换失败（rotation_backup_proof_required），失败屏无原因说明与替代路径（issue 3 执行阶段深挖）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 17（新增，待写入）
Project: CoWallet v2
Labels: RealDevice / Repro / UX-Gap
Priority: High
Source: iOS 真机真实执行（用户已授权「真实验证一次换钥匙」并授权重试；app.getcowallet.wallet v1.0.2 build 2610132055；模型 midscene 已切 deepseek-v4-1-flash-260910）
Source report:
- reports/2026-10-14T11-26-53-106Z-rotate-verify-retry/（「再试一次」→ 回到密码核对页）
- reports/2026-10-14T11-27-21-960Z-rotate-verify-password/（输入恢复密码 → 提交 → 「正在准备素数」等待页）
- reports/2026-10-14T11-28-08-033Z-rotate-verify-verify/（轮询：等待 → Face ID 提示 → 等待 → 失败）
Screenshots:
- findings/assets/feishu-issue17-rotation-exec/rotation-failed-*.png（失败屏：「钥匙没有换成（rotation_backup_proof_required）…再试一次 / 关闭」）

### 背景

issue 3 已确认 v2 **有**独立密钥轮换入口（设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」→「换一套新钥匙」）。用户本轮显式授权「真实验证一次换钥匙」，随后的中断由用户在本次会话指示「继续上面中断的测试」→ 走「再试一次」完成第二次真实尝试。

### 观察到（两次真实执行，同结果）

**第 1 次**（用户 Face ID #1 手动通过）：「开始换钥匙」→ 密码核对页 → 输入恢复密码 →「核对」→ Face ID #1 → 等待 → 失败。

**第 2 次（本次，模型切 deepseek 后由脚本驱动）**：
1. 「再试一次」→ 回到密码核对页（「先证明备份在你手里，输入你现在的恢复密码。只在这台手机上核对，不会发出去。」）；
2. 输入恢复密码（.env 提供，typeOnly 不回显）→「核对」提交；
3. 进入等待页「换一套新钥匙 / 这台手机正在准备素数…（已 0 秒）/ 请保持 App 打开。/ 可以随时取消：换好之前，旧钥匙一直有效。」（有「取消」）；
4. 轮询期间出现一次 **Face ID（面容 ID）生物识别验证提示**；
5. 最终失败屏：**「钥匙没有换成」**，副文案「钥匙没有换成（**rotation_backup_proof_required**）。旧钥匙和旧的 24 个助记词仍然有效，请稍后再试。」，按钮仅「再试一次 / 关闭」。

失败屏**无任何原因解释、无下一步指引、无「去完成备份验证」等替代路径**；只有「再试一次」会回到密码页重走一遍流程。

### 期望行为

- 换钥匙（前置已证明备份在手：恢复密码校验通过 + Face ID 确认）应能成功，或
- 若服务端要求「备份证明」（shard_metadata.backup_shard_hash / has_backup_proof，见 backend auth.rs:492）未就绪，应在失败屏给出**明确原因**（如「你保管的第三片备份尚未完成验证」）与**替代路径**（引导去完成备份验证），而不是只给一个会无限循环的「再试一次」。

### 用户影响

- 功能级：拥有合法恢复密码、且通过 Face ID 确认的用户，无法完成密钥轮换；反复「再试一次」会无限回到同一失败点，无出口、无指引。
- 与 issue 15（AI 建议的不可用安全操作返回 `not_applicable` 且无原因/替代路径）同类的 **UX 缺口**：失败即死胡同。
- 资产安全：**未造成损坏**——失败屏明确「旧钥匙和旧的 24 个助记词仍然有效」；测试前后钱包地址与余额均未变化（0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821，≈0.0039777 ETH）。

### 复现步骤

1. wallet-ready（含恢复密码）→ 设置 → 密钥安全 → 「轮换密钥分片」→「换一套新钥匙」→「开始换钥匙」。
2. 输入当前恢复密码 →「核对」→（Face ID 确认）。
3. 等待「正在准备素数…」→ 观察到失败屏「钥匙没有换成（rotation_backup_proof_required）…再试一次 / 关闭」。
4. 点「再试一次」→ 回到密码页，重走 → 再次失败。

### 备注 / 待办

- 根因推测：服务端 `has_backup_proof` 门槛未满足——该测试钱包的「第 3 份·你保管」备份（backup_shard_hash）在服务端没有有效证明（与 T24 本地验证通过不同，服务端备份证明缺失）。**需产品/后端确认**：正常完成 T24 备份验证后，服务端是否应已具备 backup proof。
- 关键链路上源未在本仓库索引中定位到 `rotation_backup_proof_required` 生成点（grep backend auth.rs/shards.rs/crypto.rs 无果），可能为动态生成或全仓搜索未覆盖。
- 若需排除「Face ID 未完成导致失败」的干扰，可再授权一次重试并在 Face ID 提示时由真人完成——但第 1 次（Face ID #1 已通过）同样失败，已排除该干扰。
- 未执行「关闭」后的状态检查（当前停在失败屏）。
