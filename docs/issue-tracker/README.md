# CoWallet v2 Issue 记录表（飞书多维表格）

**Cowallet v2 Issue List** — https://catwallet.jp.larksuite.com/base/QVGLbx4zIauLNxsxPZYjHvSbpUh
`app_token = QVGLbx4zIauLNxsxPZYjHvSbpUh`

| 表 | table_id | 内容 |
| --- | --- | --- |
| **Issue list** | `tblQSxhJi3fb4ml7` | 19 列，8 条记录，全部来自《Cowallet v2 测试》文档 |
| Cowallet v2 测试 原文 | `tbl6zEAYGCmAGrpi` | 9 列，10 行，文档逐字原文（含第 6 条的 Nitro 背景说明与结论，这两段不是 issue 所以留在原表） |

## 表结构：在原 issue list 上加了三列

字段命名和选项沿用你们 v1.6.4 / v1.6.7 / v1.6.8 的 issue list，另外按文档内容加了三列：

| 列 | 类型 | 为什么加 |
| --- | --- | --- |
| **问题类型** | 单选：功能问题 / 代码审查 | 文档里两类内容混在一起：1–5 条是真机功能问题，第 6 条是带 HIGH/MEDIUM 和文件行号的代码审查发现。不加这一列，两类问题会混成一种 |
| **文档标注状态** | 单选：未修复 / 已修复 / 未标注 | 文档自己写的修复状态。「已修复」是开发的说法，不等于测试验收通过；和 `回归验证状态` 分开，避免把文档口径当成回归结论 |
| **代码位置** | 文本 | 代码审查发现需要定位到 文件 + 行号；真机问题留空 |

原有的 `平台`、`严重程度` 保留：`严重程度` 把文档里的 HIGH/MEDIUM 折算成 高/中（Blocker/高/中/低 沿用中文口径，资金与安全相关一律 ≥ 高）。

完整 19 列顺序（按「问题与证据 → 开发反馈 → 测试回归」排）：

```
序号 / Issue / 问题类型 / 平台 / 严重程度 / 文档标注状态 / 代码位置
/ APP截图 / figma截图 / Issue备注 / 影响 / 问题归类
/ 反馈状态 / 反馈备注
/ 回归验证状态 / 回归备注 / 回归截屏 / 开发人员 / 创建时间
```

## 内容：只有文档里的 8 条

| 序号 | 问题类型 | 标题 | 文档标注 | 代码位置 | 严重程度 | 截图 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 功能问题 | 收款没有任何消息提示 | 未修复 | — | 中 | — |
| 2 | 功能问题 | iCloud 已登录，但第三片提示未登录、无法备份 | 已修复 | — | 高 | 01 |
| 3 | 功能问题 | 轮换密钥失败 | 已修复 | — | 高 | 02 |
| 4 | 功能问题 | 三个分片的表述不一致 | 已修复 | — | 中 | 03、04 |
| 5 | 功能问题 | ETH 转账失败 | 未标注 | — | 高 | 05 |
| 6 | 代码审查 | Enclave HIGH：宿主可重放旧分片状态 | 未标注 | `crates/mpc2-server/src/remote.rs 243–266` | 高 | — |
| 7 | 代码审查 | Enclave MEDIUM：中止会话退回额度绕过限额 | 未标注 | `crates/mpc2-server/src/ledger.rs 610–619` | 中 | — |
| 8 | 代码审查 | Enclave MEDIUM：重复账本 ID 覆盖记账记录 | 未标注 | `crates/mpc2-server/src/ledger.rs 507–509` | 中 | — |

序号 6–8 对应文档第 6 条里的 3 项审查发现，`Issue备注` 里写了「文档原文：文档第 6 条审查发现的第 N 项……」，可以逐条对回文档。

v1 的历史 issue（Android UX 巡检 18 条、v1.0.x/v1.0.2 真机 findings 68 条）**没有**放进这张表，按你的要求只保留文档内容。历史数据仍在仓库里：`scripts/issue-tracker/dist/cowallet-issues.csv`（94 条，含 Linear 号与来源）。

## 常用命令

```bash
# 抓取《Cowallet v2 测试》文档原文快照 + 解析成行
node scripts/issue-tracker/fetch-source-doc.mjs

# 重新生成导出文件（dist/cowallet-v2-issues.csv 对齐上面的表结构）
node scripts/issue-tracker/build-issue-dataset.mjs

# 重建 Issue list 表（改成当前的 19 列结构 + 只导文档内容）；--apply 才写远端
node scripts/issue-tracker/rebuild-issue-table.mjs
node scripts/issue-tracker/rebuild-issue-table.mjs --apply

# 把文档里的证据截图挂到指定表的对应记录（保留已有附件，只追加）
node scripts/issue-tracker/attach-v2-evidence.mjs --apply \
  --app-token QVGLbx4zIauLNxsxPZYjHvSbpUh --table tblQSxhJi3fb4ml7

# 全新多维表格（两张表一起建，用于另起一份时）
node scripts/issue-tracker/create-v2-base.mjs --apply

# 飞书 OAuth 重新授权（token 失效或权限不足时）
node scripts/issue-tracker/authorize-lark.mjs
```

共享代码：`lib/lark.mjs`（Base/附件 API 与鉴权）、`lib/issue-mapping.mjs`（数据集 → 字段映射，含三类问题类型的判定）、`lib/v2-evidence.mjs`（文档截图 → 序号映射，逐张看图确认过）。

**为什么重建而不是改字段**：飞书没有调整字段顺序的接口，新增字段只会追加到末尾，会破坏阅读顺序；所以按目标结构建新表、导入并校验通过后才删旧表。重建脚本的校验不通过时不会删旧表。

## 遗留事项

- 你原 Base `Pnr3bYPPmaBqLys4Ss0jgPurpX4` 里还留着一张早先建的 `Cowallet v2 issue list`（`tblfCEKkuORn4h7E`，94 条）。不需要的话说一声我删掉——我不主动删表。那个 Base 里原有的 7 张表始终没动过。
- 8 条的 `平台` 都是空的：文档没标平台。截图看着是 iOS（iCloud、Secure Enclave、Face ID），但没有证据就不填。
- `开发人员`、`创建时间` 留空。

## 授权注意事项

- 飞书应用 `cli_a9313a6d3a385e18` 只登记了回调 `http://localhost:3000/callback`，其它端口会被 Lark 以 20029 拒绝。3000 被 `wallet-agent-demo-next-1` 容器占用时需要先腾出来（`docker stop`）。
- 读写 Base 需要 user access token 带 `bitable:app`；应用身份（tenant token）不行。
- 更新数据表用的是 `PATCH /tables/{id}`，用 PUT 会返回 404（踩过）。
