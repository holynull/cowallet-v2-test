# CoWallet v2 iOS 真机测试报告（2026-10-15 兑换专项）

> 测试周期：2026-10-15（Asia/Shanghai）
> 测试方式：真机黑盒 + AI 视觉驱动（Midscene / Appium + WebDriverAgent，视觉模型 DeepSeek `deepseek-v4-1-flash-260910`，effort=medium 防 429）
> 被测版本：CoWallet v1.0.2（TestFlight build **2610141608**，2026-10-15 自动更新）
> 测试重点：兑换（swap）真实交易专项 + 六链转账覆盖 + 新 build 收款推送信号复核
> Issue 事实源：飞书 Base `QVGLbx4zIauLNxsxPZYjHvSbpUh` / 表 `tblQSxhJi3fb4ml7`

---

## 1. 报告概述

今日测试围绕 **兑换（swap）真实交易专项** 展开，依据《v1.0.2 手动兑换真实交易测试指南》（`docs/2026-10-15-v102-manual-swap-real-tx-guide.md`，自旧项目移植适配），同时完成 **六条支持链转账覆盖** 与 **新 build 收款推送信号复核**。

- 在 wallet-ready 状态下，对 **Ethereum / Base / Arbitrum / Optimism / BSC / Polygon 六条链** 的真实转账全链路做了覆盖，**均未发现问题**；
- 经当次授权 + 真人 Face ID，真实执行了 2 笔兑换（ARB 10 USDT→ETH、ETH 主网 10.78 USDT→ETH），**两笔最终都被 Bridgers 退款（refund_complete）**，并暴露出结果终态误报问题；
- 新发现 4 条兑换链路问题（issue 18–21），覆盖多链失败态文案、错误分类不一致、结果终态误报、计划卡不清理；
- 补充了 issue 16（收款到账无 PUSH）的 **正向反转信号**：新 build 在收款页（前台）已出现系统级推送横幅，待后台/锁屏复测后确认是否修复。

所有真实资金动作均在当次明确授权、白名单地址/限额内、确认卡核对后由真人 Face ID 确认；其余用例一律停在确认卡/签名边界之前。

## 2. 环境与设备基线

| 项 | 值 |
| --- | --- |
| 设备 | iPhone 13 mini（iOS 26.6.1；Xcode 26.5），USB 真机 |
| UDID | `00008110-000A6D3C3450401E` |
| 被测 App | `app.getcowallet.wallet` v1.0.2 build **2610141608**（TestFlight 分发；更新链 2610121802 → 2610132055 → 2610141608） |
| 驱动 | Midscene + Appium + WebDriverAgent（WDA `http://127.0.0.1:8100` 长驻复用） |
| 视觉模型 | DeepSeek `deepseek-v4-1-flash-260910`（思考启用 + effort=medium + 重试 8 次，防 429，真机验证） |
| 钱包地址 | EOA `0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821`（Ethereum 主网） |
| 链上余额 | ≈ 0.0039777 ETH ≈ 总资产 $9.97（2026-10-14 基线；当日兑换所用 USDT 为另行转入，均已原路退回） |
| 测试账号 | 邮箱 `reinpassion@gmail.com`（OTP 真人转述）；钱包密码仅存本地 `.env`，不入报告 |
| 资金闸门 | `TEST_SAFE_EVM_RECEIVER=0x75276A6E673B4083b640956262605955F11D767B`；`MANUAL_CONFIRM_REAL_TRANSFER=true`；`MAX_TEST_TRANSFER_USD=5` |

## 3. 测试范围与方法

**覆盖的功能域**

- 六链真实转账（Ethereum / Base / Arbitrum / Optimism / BSC / Polygon）——全链路到账核对；
- 兑换真实交易（AI 对话驱动，按手动指南）：报价卡字段、滑点、路由、确认卡、授权+兑换两段执行、链上终态；
- 兑换失败态/边界：多链多币种（OP 10USDT→ETH、Base ETH→USDT/USDC、BSC BNB↔USDT、Polygon POL→USDT）只到确认卡或失败态；
- 收款推送信号复核（新 build 2610141608）。

**方法与约束**

- 真实提交：当次授权 + 白名单/限额 + 确认卡核对（链/token/金额/地址/滑点）+ 真人 Face ID；AI 自动脚本只读、不代点确认；
- 兑换请求由真人在 AI 聊天输入，脚本/人工只观察对话结果（计划卡、失败文案、执行进度、终态）；
- 失败态文案做「可理解的单一失败文案 + 明确出口」对照；
- 已知环境噪声：TestFlight 自动更新 build、公共 RPC 瞬态归零（多 RPC 取最大值）、OTP 每小时 3 次限流。

## 4. 执行统计

| 指标 | 数值 |
| --- | --- |
| 覆盖链 | Ethereum / Base / Arbitrum / Optimism / BSC / Polygon（6 条） |
| 六链转账 | **全部通过**（无异常，无对应 issue） |
| 真实兑换执行 | 2 笔（ARB 10 USDT→ETH；ETH 主网 10.78 USDT→ETH）——**均 refunded 退款** |
| 新增 issue | 4 条（issue 18–21，全部中优先级、待反馈/待确认） |
| 失败态用例 | 6+ 组（覆盖 502 / 请求参数错误 / 误报成功 / 双卡并存） |
| 证据截图 | 按 issue 归档共 13 张（已挂飞书对应记录） |

## 5. 缺陷总览（今日新增 4 条）

| 序号 | Issue | 严重程度 | 文档标注 | 回归验证 |
| --- | --- | --- | --- | --- |
| 18 | 兑换失败：错误文案堆叠且直接暴露「服务器错误，状态码：502」，无统一失败态与重试/替代引导（OP 10USDT→ETH、Base 0.002ETH→USDT 两链复现） | 中 | 未标注 | 🆕 待确认 |
| 19 | 兑换源链上链后 AI 误报「已换成 ETH」，实际订单 refunded 退款，需用户追问才暴露（ARB + Ethereum 主网跨链复现） | 中 | 未标注 | 🆕 待确认 |
| 20 | 兑换失败：堆叠文案含「请求参数错误」，无明确原因与重试/替代引导（BSC BNB↔USDT、Base ETH→USDC、Polygon POL→USDT 跨三链） | 中 | 未标注 | 🆕 待确认 |
| 21 | 兑换计划卡被新卡取代/过期后不清理，双卡并存；执行中新卡自身误标「已过期」 | 中 | 未标注 | 🆕 待确认 |

> 含既有 issue 状态更新：**issue 16（收款无 PUSH）出现正向反转信号**（新 build 前台收款已现系统推送横幅），待后台/锁屏复测后更新结论。

## 6. 重点问题详述

### 6.1 Issue 18：失败文案堆叠 + 直接暴露后端 502

「OP 上 10 USDT 换 ETH」→ 助手一次性堆叠 4 段错误文案：

> 无法生成计划 / 没法生成这个计划 / **服务器错误，状态码：502** / 暂时没有可用的兑换路线，稍后再试。

- **第 2 例（同会话，14:23）**：「Base 上的 0.002ETH 换 USDT」→ 同样 4 段堆叠含 502 → **502 非 OP 独占**。
- 问题点：① 把后端原始 HTTP 状态码直接暴露给用户；② 多段文案语义重复且矛盾；③ 无重试/替代路径引导。
- 与 issue 20 对照：同为「买入 USDT」，Base 报 502、Polygon 报参数错误 → 后端错误分类不一致。

### 6.2 Issue 19：兑换误报「已换成 ETH」，实为退款（跨链复现，真实资金）

两笔真实兑换执行后同模式复现：

- **ARB 10 USDT→ETH（13:42）**：AI 先报「已确认上链 + 已换成 ETH」，用户追问「兑换成功了吗」→ 查订单为 **refunded（refund_complete）**，10 USDT 原路退回；
- **ETH 主网 10.78 USDT→ETH（14:48，真实执行 + Face ID）**：计划 `35bf6c06` 执行（授权 `0x498b..f9b2` + 兑换 `0x018c3964...10ca88`，已确认 34 区块）；AI 先报「兑换已完成 / 已上链」，用户追问「到账了吗」→ 改口「这笔没换成 — 订单状态是已退款（refund_complete），USDT 已经退回你的钱包，ETH 没到账。」。

核心问题：**结果卡/AI 回复只因源链 tx confirmed 就宣称兑换成功，与实际订单终态（refunded）不一致；失败退款需用户主动追问才暴露，无主动通知**。失败诱因疑为滑点设 0.5% 偏低（Bridgers 退款），默认 1% 成功率更高。

### 6.3 Issue 20：「请求参数错误」失败文案堆叠（跨三链）

「0.007bnb 换 USDT」→ 助手堆叠返回「无法生成计划 / 没法生成这个计划 / **请求参数错误** / 暂时没有可用的兑换路线」。随后 4 例复现：

- BSC「bsc 上全部 USDT 换 bnb」（方向相反）→ 同样报参数错误；
- Base「0.002ETH 换 USDC」→ 同样报参数错误；
- Polygon「60pol 换 USDT」×2 → 同样报参数错误。

→ **错误不局限于 BSC/Base/Polygon 任一链**，跨三链触发；且与 issue 18 的 502 对照，错误分类疑按「链 × 路由（聚合器）」分流，后端各聚合器/路由错误映射不一致。

### 6.4 Issue 21：计划卡被取代/过期不清理 + 状态标签错误

- **Base 新对话（14:14）**：只发一条「Base 上的全部 USDC 换成 ETH」、未点任何按钮，即出现两张并存计划卡（旧 `c299acdf` 已过期 + 新 `a80e920f` 生效），旧卡不清理；
- **Ethereum 真实执行（14:48）**：旧计划卡 `d694159e` 被 `35bf6c06` 取代后同样不清理；且**执行中的新计划卡 `35bf6c06` 自身也标「已过期」**（实际已授权并上链）→ 计划状态标签与执行状态不一致。

风险：财务确认区双卡并存，旧卡仍是完整确认卡样式，存在误按/误读风险。

## 7. 正向结果 / 无问题项

- **六条支持链（Ethereum / Base / Arbitrum / Optimism / BSC / Polygon）真实转账全链路通过**，链名、币种、金额、到账均正确，无对应 issue。
- **issue 16 反转信号（新 build 2610141608）**：收款页（前台）收到 `1 USDT（Ethereum）` 后出现系统级推送横幅「收到 1 USDT（Ethereum）/ 0xf779…c589 / 点一下看这笔」——旧 build 2610132055（T29）同一场景无任何资金 PUSH。疑似新 build 已补「收款到账推送」，**待后台/锁屏场景复测后更新 issue 16 状态**。

## 8. 风险与建议

1. **兑换结果终态误报（Issue 19）优先级最高**：真实资金场景下 AI 先报「已换成 ETH」、实际退款需追问才暴露。建议：结果卡不得仅因源链 tx confirmed 就显示兑换成功，应等 Bridgers 订单终态（success/refunded）后再下结论；失败退款应主动通知；产品确认滑点默认值/可选项。
2. **失败态文案统一（Issue 18/20）**：把后端 502、请求参数错误等内部错误直接抛给用户，且多段文案重复矛盾、无重试出口。建议统一为可理解的单条失败文案（区分余额/路线/服务暂不可用）+ 重试/替代引导；并梳理后端各链各路由的错误映射，避免同类请求错误分类不一致。
3. **计划卡清理与状态（Issue 21）**：报价被刷新/取代时旧卡应移除或折叠为提示；执行中卡片不应标「已过期」。财务确认区双卡并存有误操作风险。
4. **收款 PUSH（Issue 16）**：前台已现推送横幅是正向信号，但锁屏/后台是否推送仍待复测；若通过可将 issue 16 标为已修复。
5. **真实兑换前置条件**：当前钱包各非主网链无稳定币/原生币资金，跨链兑换真实提交受限；后续如需覆盖 OP/Arbitrum/BSC/Base/Polygon 真实兑换，需先给对应链打测试币。

## 9. 遗留事项 / 待办

- **issue 16**：新 build 后台/锁屏收款 PUSH 复测（T29 式），通过则更新为已修复。
- **issue 19**：真实资金 + 跨链复现，建议产品/后端确认「失败退款主动通知 + 结果卡终态口径」。
- **issue 17**（前一轮遗留）：真实换钥匙失败 `rotation_backup_proof_required` 根因待产品/后端确认。
- 兑换真实交易指南（`docs/2026-10-15-v102-manual-swap-real-tx-guide.md`）为本专项操作依据，后续轮次按链补打测试币后继续覆盖。

## 附录 A：今日相关脚本/文档

| 项 | 说明 |
| --- | --- |
| `docs/2026-10-15-v102-manual-swap-real-tx-guide.md` | 手动兑换真实交易测试指南（自旧项目移植适配） |
| `scripts/issue-tracker/attach-issue18-swap-502.mjs` 等 | 今日 issue 记录/归档脚本（飞书 Base） |
| `docs/TEST-CAMPAIGN-BASELINE.md` | 跨会话测试基线（本日已同步） |
| `docs/issue-tracker/issue-status.md` | Issue 状态快照（`snapshot-issues.mjs` 刷新，18 条） |

## 附录 B：证据索引

- 截图证据：`findings/assets/feishu-issue18-swap-502/`、`feishu-issue19-arb-refund/`、`feishu-issue20-bnb-param-error/`、`feishu-issue21-dual-plan-cards/`、`feishu-issue16-newbuild-push/`（按 issue 分组，已挂飞书对应记录）
- 本地 finding：`findings/FINDING-swap-502-error-stack.md`、`FINDING-arb-swap-false-success-refund.md`、`FINDING-bnb-swap-param-error-stack.md`、`FINDING-dual-plan-cards-auto.md`、`FINDING-push-receive-newbuild.md`
- 逐次运行：`reports/<runName>/summary.json`（未入库，按需保留）
