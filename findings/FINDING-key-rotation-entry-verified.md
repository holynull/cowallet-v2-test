## FINDING: 密钥轮换入口回归更正（issue 3）——v2 存在独立「换一套新钥匙」轮换入口

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 3（回归补证，record reczz28MNNXaNbKw）
Project: CoWallet v2
Labels: Regression / Correction
Priority: High
Source: iOS 真机只读观察（用户手动导航 + 探针 `_probe_rotate_capture.mjs`，app.getcowallet.wallet v1.0.2 build 2610132055）
Source report:
- reports/2026-10-14T09-01-29-390Z-probe-rotate-capture/（探针捕获，HTML 报告含页面完整文案）
Screenshots:
- findings/assets/feishu-issue3-rotate/rotate-entry-xinhuan-20261014.png（「换一套新钥匙」轮换页）

### 更正说明

**此前 T25 结论「v2 无独立轮换入口、轮换=恢复」有误，予以更正。** 2026-10-14 用户手动导航发现：设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」是一个**独立存在的入口**。

### 观察到

轮换页标题为**「换一套新钥匙」**，页面说明完整：
- 手机 / 服务器 / 备份三份全部换新，钱包地址不变；换后给一组新的 24 个助记词，旧的 24 词与旧备份作废；
- 警示：若做过「应急导出手机钥匙」，导出文件不会因换钥匙失效（导出文件+旧24词+当时口令仍=整个钱包），需自行销毁旧导出文件；
- 前置：输入当前恢复密码或 24 个助记词证明备份在手；预计 1-3 分钟（服务器要准备素数）；开始时 Face ID 确认一次，抄好新 24 词点「继续」后再确认一次才换到新钥匙；
- 反诈提示：官方不会索要 24 词/恢复密码/邮箱验证码/备份文件/口令。
- 按钮：「开始换钥匙」（执行边界，不可逆，**未点**）/「先不换」（安全退出）。

### 与 issue 3 的关系

issue 3 原证据为「轮换密钥失败」（v1 文档标注已修复）。本次更正：v2 的密钥轮换入口**存在且流程说明完整**。此前 AI「保护这台手机」返回 `not_applicable`（secure_this_phone）属于独立的 UX 缺口（见 issue 15），与本入口无关，不应再被当作「无轮换入口」的证据。

### 影响

密钥轮换入口完整可用（待实测执行），「无独立轮换入口」的旧判断不再成立。实际执行换钥匙属不可逆操作，本轮**未授权测试**。

### 复现步骤（只读观察，未执行）

1. wallet-ready → 设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」。
2. 进入「换一套新钥匙」页，核对三份换新 / 地址不变 / 新 24 词 / Face ID 双确认 / 反诈提示文案。
3. 停在「开始换钥匙」（执行边界）之前，用「先不换」安全退出。

### 备注

- 执行边界未触发：未点「开始换钥匙」，未进行任何签名/作废动作。
- 待办：真实执行换钥匙需用户显式授权（不可逆），执行成败/新 24 词下发待后续验证。
- 旧 finding `FINDING-key-rotation-not-standalone.md`（标题「v2 无独立轮换按钮」）已作废删除。
