# v1.0.2 手动兑换真实交易测试指南（CoWallet v2）

Status: local-draft
Owner: QA manual test
Date: 2026-08-14（初版）；2026-10-15 从旧项目 `blackbox-device-tests` 移植并适配到当前测试仓库 `cowallet-v2-test`
Scope: iOS wallet-ready 状态，AI 聊天兑换（swap）流程

> 本文档定位：**手动测试真实交易的指导**，不是自动化脚本。目标不是把所有币种都真实兑换一遍，而是用少量真实交易覆盖核心执行链路，用更多“只到确认卡/失败态”的低成本用例覆盖支持币种、链识别、decimals、异常文案和跨链终态。
>
> 真实提交属于**安全执行边界**：任何一笔真实 swap 都需要当轮明确授权、金额在 `.env` 上限（`MAX_TEST_TRANSFER_USD`）内、且满足当前测试会话的授权规则。授权不等于交易授权——用例停在确认卡/签名页时，一律不代点确认。

## 构建口径（测试目标）

当前测试目标是 **TestFlight 分发的 iOS 真机包**，不是 git 分支：

- 目标 App：`app.getcowallet.wallet`，版本 **1.0.2**，build **2610141608**（TestFlight，2026-10-15 更新；此前 2610132055）
- 测试设备：iPhone 13 mini / iOS 26.6.1，UDID `00008110-000A6D3C3450401E`（脚本经 `IOS_UDID` pin 死）
- 复测前必须记录：实际安装包的 App build、后端环境、本次执行的链上余额快照。
- 该版本应已包含 swap 状态收敛、无报价终态、无路由 422、跨链 orderId/服务端轮询、报价持久化和失败分类等修复。因此旧项目 2026-08-13～14 的发现不能直接作为本版本结论，必须在目标包上定向回归。

## 背景与当前钱包约束

本轮由 QA 侧手动覆盖兑换链路。**当前钱包约束**（2026-10-15 基线）：

- EOA `0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821`（Ethereum 主网）
- 余额 ≈ **0.0039777 ETH ≈ $9.97**；**无 USDT/USDC，无 OP/Arbitrum/BSC/Base/Polygon 资金**
- 含义：本指南 P0 的 OP/Arbitrum 稳定币同链/跨链**真实提交暂不可执行**，需先给对应链打测试币；在此之前以“报价卡正确性 + 失败态清晰”为主，与测试策略第 6 条一致。

源码依据（指到应用源码兄弟仓库 `../cowallet`）：

- 后端 Bridgers 静态 token/chain 映射：`../cowallet/backend/api-server/src/services/bridgers.rs`
- 后端 `/swap/quote`、`/swap/build`、`/swap/order`：`../cowallet/backend/api-server/src/routes/swap.rs`
- AI swap 工具执行器：`../cowallet/backend/api-server/src/services/ai_executor/swap.rs`
- 移动端 swap 确认执行：`../cowallet/mobile/lib/services/intent_executor.dart`
- 移动端链配置：`../cowallet/mobile/lib/services/chain_service.dart`
- 移动端确认卡展示：`../cowallet/mobile/lib/views/chat/widgets/swap_confirm_widget.dart`

## 测试策略

1. 每条主测链至少跑到确认卡，确认链名、币种、金额、预计获得数量、route、滑点、预计到账时间。
2. 真实提交只选择低成本、代表性路径，不要求每个币都真换。
3. 同链和跨链都要覆盖；跨链不能以源链 tx 成功作为最终成功，要看 Bridgers order 终态和目标链到账。
4. ERC-20 卖出要覆盖 approve 路径；USDT 类代币还要关注 allowance reset/approve/swap 多笔签名。
5. 6 decimals 稳定币是重点：USDC、USDT、USDT0/USD₮0 相关路径优先。
6. 无测试币时，优先测“报价卡是否正确”和“失败态是否清楚”，不要为了全覆盖强行真交易。

执行与记录口径（当前仓库约定）：

- 截图存 `reports/<run>/`（自动化）或 `findings/assets/<run-name>/`；确认的观察写入 `findings/` 本地草稿，并按需进飞书 Base。
- 用例结果记录：飞书 Base `QVGLbx4zIauLNxsxPZYjHvSbpUh` / 表 `tblQSxhJi3fb4ml7`（issue 事实源）。
- 每轮真实提交前核对 `.env` 安全闸：`MANUAL_CONFIRM_REAL_TRANSFER`、`MAX_TEST_TRANSFER_USD`、`TEST_SAFE_EVM_RECEIVER`。

## 源码支持矩阵

移动端主链配置覆盖：

| 链 | chain_id | 源码支持币种重点 |
| --- | ---: | --- |
| Ethereum | 1 | ETH, WETH, USDC, USDT, DAI |
| Base | 8453 | ETH, WETH, USDC, USDT, DAI |
| Arbitrum | 42161 | ETH, WETH, USDC, USDT, DAI |
| Optimism | 10 | ETH, WETH, USDC, USDT, DAI |
| BSC | 56 | BNB, WBNB, USDC, USDT |
| Polygon | 137 | POL/MATIC, USDC, USDT |

需要特别注意：

- 后端 Bridgers chain 映射还包含 Avalanche、FTM、ZKsync、Linea、Scroll，但移动端链服务没有完整配置，先不作为真实交易主测范围。
- 移动端配置里有 Polygon WETH、BSC/Polygon DAI，但后端静态 swap 表没有完整 symbol 映射。这些路径应优先测“不支持/失败文案”，确认不会生成误导性可确认卡。
- AI 卖出侧可以通过 portfolio token 命中非 ASCII symbol，例如 `USD₮0`；买入侧更依赖静态表，风险更高。

## 主测链选择

| 优先级 | 链 | 原因 | 当前钱包约束下的执行方式 |
| --- | --- | --- | --- |
| P0 | Optimism | gas 低，适合多次同链/跨链验证 | 需先给 OP 打 ETH/USDT 才能真提交；否则只到报价卡 |
| P0 | Arbitrum | gas 低，USDT/USDC 使用频繁，覆盖 6 decimals 与跨链到账 | 需先给 Arbitrum 打 USDT/USDC；否则只到报价卡 |
| P1 | BSC | native 为 BNB，覆盖非 ETH native、BNB/WBNB、BSC USDT | 需先给 BSC 打 BNB/USDT |
| P1 | Base | 热门链，低 gas，补充 ETH/USDC/USDT 同链与跨链 | 需先给 Base 打 ETH/USDC |
| P2 | Polygon | native 为 POL/MATIC，看链名、native symbol、后端不完整映射 | 以失败文案为主 |
| P2 | Ethereum | gas 高，仅建议报价卡和失败态验证 | **当前唯一有资金（≈$9.97 ETH）**，可做小额真实提交 |

## 六条正式支持链的最低门槛

六条移动端正式配置链都必须至少完成一次确认卡或明确失败态验证；这不是要求六条链都真实提交。

| 链 | 最低要求 | 默认是否真实提交 |
| --- | --- | --- |
| Optimism | ETH/USDT 或 USDT/USDC 确认卡 | 代表性路径可小额提交（需资金） |
| Arbitrum | USDT/USDC 确认卡，检查 6 decimals | 代表性路径可小额提交（需资金） |
| BSC | BNB/USDT 确认卡，检查 native gas | 代表性路径可小额提交（需资金） |
| Base | ETH/USDC 确认卡 | 默认不提交 |
| Polygon | POL/USDT 确认卡，检查 POL/MATIC 展示 | 默认不提交 |
| Ethereum | USDT/ETH 确认卡，检查高 gas 风险提示 | 不提交（当前资金为 ETH，如需真提交用 ETH→USDC/USDT 小额） |

以下静态 token 映射不完整的组合应作为负向用例，预期是清楚失败，不能生成“预计获得为空但仍可确认”的卡片：

- `Polygon 上 WETH 换 USDC`
- `Polygon 上 DAI 换 USDT`
- `BSC 上 DAI 换 USDT`

## 同链覆盖用例

### Optimism

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-OP-1 | `OP 上 ETH 换 USDC` | 出现确认卡；网络显示 Optimism |
| Q-OP-2 | `OP 上 USDC 换 ETH` | USDC 6 decimals 正确 |
| Q-OP-3 | `OP 上 USDT 换 USDC` | USDT/USDC 同链互换，6 decimals |
| Q-OP-4 | `OP 上 ETH 换 USDT` | ETH native 卖出，USDT 6 decimals 正确 |

### Arbitrum

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-ARB-1 | `Arbitrum 上 USDT 换 USDC` | 6 decimals 稳定币互换，网络为 Arbitrum |
| Q-ARB-2 | `Arbitrum 上 ETH 换 USDT` | 确认卡金额/预计获得合理 |
| Q-ARB-3 | `Arbitrum 上 USDC 换 ETH` | USDC 卖出路径能报价或清楚失败 |
| Q-ARB-4 | `Arbitrum 上 USDT0 换 USDC` | 非 ASCII `USD₮0` 卖出路径 |

### BSC

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-BSC-1 | `BSC 上 BNB 换 USDT` | native symbol 显示 BNB，不应显示 ETH gas |
| Q-BSC-2 | `BSC 上 USDT 换 BNB` | ERC-20 卖出 + BNB native 买入 |
| Q-BSC-3 | `BSC 上 USDT 换 USDC` | 6 decimals 稳定币互换 |
| Q-BSC-4 | `BSC 上 WBNB 换 USDT` | WBNB ERC-20 路径能正确报价或清楚失败 |

### Base

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-BASE-1 | `Base 上 ETH 换 USDC` | 出现确认卡；网络为 Base |
| Q-BASE-2 | `Base 上 USDC 换 ETH` | USDC 6 decimals 正确 |
| Q-BASE-3 | `Base 上 USDT 换 USDC` | USDT/USDC 同链互换 |
| Q-BASE-4 | `Base 上 DAI 换 USDC` | DAI 路径能报价或清楚失败 |

### Polygon

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-POL-1 | `Polygon 上 POL 换 USDT` | native symbol 为 POL/MATIC，不能误显示 ETH |
| Q-POL-2 | `Polygon 上 USDT 换 POL` | ERC-20 -> native 路径 |
| Q-POL-3 | `Polygon 上 USDC 换 USDT` | 稳定币互换 |
| Q-POL-4 | `Polygon 上 WETH 换 USDC` | 若不支持，应清楚失败；不能生成错误可确认卡 |
| Q-POL-5 | `Polygon 上 DAI 换 USDT` | 若不支持，应清楚失败；不能误走 18 decimals |

### Ethereum

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| Q-ETH-1 | `Ethereum 上 ETH 换 USDT` | 仅确认卡；不建议真实提交（gas 高） |
| Q-ETH-2 | `Ethereum 上 USDT 换 ETH` | USDT 6 decimals 正确（需有 USDT） |
| Q-ETH-3 | `Ethereum 上 DAI 换 USDC` | DAI/USDC 报价或清楚失败 |

## 跨链覆盖用例

优先真实提交 1-2 条，其余跑到确认卡。

| 编号 | 输入话术 | 是否建议提交 | 预期 |
| --- | --- | --- | --- |
| X-1 | `OP 上 USDT 换 Arbitrum 上 USDT` | 是 | 源链 tx 成功后不能直接最终成功；需 order 终态和目标链到账 |
| X-2 | `Arbitrum 上 USDT 换 OP 上 USDT` | 可选 | 反向路径能获取报价和 order |
| X-3 | `BSC 上 USDT 换 Arbitrum 上 USDT` | 可选 | BSC native gas、跨链 order、目标链到账 |
| X-4 | `Arbitrum 上 USDT 换 BSC 上 USDT` | 可选 | BSC 作为目标链显示正确 |
| X-5 | `Base 上 USDC 换 Arbitrum 上 USDC` | 只到确认卡 | 热门 L2 稳定币跨链 |
| X-6 | `Polygon 上 USDT 换 OP 上 USDT` | 只到确认卡 | POL gas 与跨链 route 显示 |

跨链结果检查：

- 确认卡必须显示源链和目标链，例如 `Optimism -> Arbitrum`。
- 点击确认后，应记录源链 tx hash。
- App 必须拿到 Bridgers `orderId`；没有 orderId 时要清楚提示“链上已提交但订单未追踪”。
- 结果卡不能只因源链 tx confirmed 就显示最终兑换成功。
- 重启 App 或重新进入聊天历史后，跨链结果卡不能丢失，且应能继续查询订单终态。
- 目标链到账后，首页余额和聊天结果状态应最终一致。

## 失败态覆盖

这些用例不需要测试币。

| 编号 | 输入话术 | 预期 |
| --- | --- | --- |
| F-1 | `把 999999 USDT 换成 ETH` | 余额不足，不应进入签名 |
| F-2 | `把 0.000001 USDT 换成 ETH` | 若低于 Bridgers 最小额，应显示金额范围，不应出现可确认 0 结果 |
| F-3 | `DOGE 换 USDT` | 不支持币种清楚提示 |
| F-4 | `换点 USDT` | 链/卖出币不明确时应追问，不能随便选链执行 |
| F-5 | `Polygon 上 WETH 换 USDC` | 若后端不支持，应清楚失败 |
| F-6 | `BSC 上 DAI 换 USDT` | 若后端不支持，应清楚失败 |
| F-7 | 无 native gas 时执行 ERC-20 swap | 应显示 gas 不足卡，不应提交失败交易 |

## 每个用例统一检查点

执行每条用例时记录以下内容：

- 输入原文是否被正确理解。
- 是否出现兑换确认卡，而不是纯文字回复。
- 源链、目标链、from token、to token 是否正确。
- 预计获得是否为空、0、异常大或异常小。
- 6 decimals token 的显示是否合理，尤其 USDC/USDT/USDT0/USD₮0。
- 金额超范围时，确认按钮是否隐藏或不可执行。
- gas 不足、余额不足、RPC/Bridgers 失败文案是否可理解。
- ERC-20 卖出是否触发 approve；多次签名是否都能完成。
- App 后台/重启后，结果卡和历史是否保留。
- 跨链目标链到账后，App 状态是否从 pending/failed 更新到正确终态。

## 问题记录模板

| 字段 | 内容 |
| --- | --- |
| 用例编号 | |
| 输入话术 | |
| 当前链/资产余额 | |
| 是否出现确认卡 | |
| 是否点击确认 | |
| tx hash | |
| orderId | |
| 目标链是否到账 | |
| 实际表现 | |
| 预期表现 | |
| 截图路径 | |
| 是否已记录（飞书 Base / findings） | |

## 优先级建议

1. P0：OP/Arbitrum 的 USDT/USDC/ETH 同链与跨链（需先补 L2 资金）。
2. P0：任意一条 ERC-20 卖出真实提交，覆盖 approve + swap。
3. P0：任意一条跨链真实提交，覆盖 orderId、轮询、目标链到账。
4. P1：BSC 的 BNB/USDT 路径，覆盖非 ETH native。
5. P1：非 ASCII `USD₮0` 卖出路径。
6. P2：Polygon、Ethereum、后端不完整 symbol 的失败文案。

## 当前钱包下的“马上能跑”清单（2026-10-15）

当前只有主网 ETH（≈$9.97）时，无需补充资金即可执行：

- **负向/失败态**：F-1、F-2、F-3、F-4、F-5、F-6、F-7（全部不需测试币）。
- **报价卡核对（Ethereum）**：Q-ETH-1（`Ethereum 上 ETH 换 USDT`）——验证确认卡字段、高 gas 提示，不提交。
- **小额真实提交（需当轮授权）**：`Ethereum 上 ETH 换 USDC`（或 USDT）小额，覆盖 approve + swap + 真实终态 + 6 decimals 展示；金额受 `MAX_TEST_TRANSFER_USD` 约束。
- **跨链报价**：X-5 / X-6 这类只到确认卡的路径，验证源/目标链显示与 route，不提交。
