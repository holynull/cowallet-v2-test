# CoWallet v2 真机测试基线 / 跨会话交接（Baseline & Handoff）

> **任何新会话开始测试前，先读本文件 + `docs/issue-tracker/issue-status.md`。**
> 本文件是测试战役的「当前状态基线」：环境、进度、结论、待办都在这里汇总。
> 每次会话结束，更新本文件并重跑快照，让下一个会话能无缝接续。

最后更新：2026-10-15 14:55（Asia/Shanghai）
仓库：`/Users/zhangleping/github.com/holynull/cowallet-v2-test`（`main` 已 push 至 `e048807`：基线 `7a8b2f5` → issue3 纠错 `ef8cd15` → 报告重新生成+对齐 `e048807`；App 源码在兄弟仓库 `../cowallet`）
Issue 事实源：飞书 Base `QVGLbx4zIauLNxsxPZYjHvSbpUh` / 表 `tblQSxhJi3fb4ml7`
本地快照：`docs/issue-tracker/issue-status.md`（`node scripts/issue-tracker/snapshot-issues.mjs` 刷新）
测试报告文档：`docs/TEST-REPORT-2026-10-14.md` 为唯一事实源；导入飞书用
`node scripts/issue-tracker/regenerate-report-doc.mjs`（改报告=改 md + 重跑；旧文档已删除，
旧块级编辑脚本 update-report-doc / align-report-to-base / remove-report-rows 已废弃移除）

---

## 1. 环境与设备基线

| 项 | 值 |
| --- | --- |
| 设备 | iPhone 13 mini（iOS 26.6.1；Xcode 26.5），USB 连接 |
| UDID | `00008110-000A6D3C3450401E`（`IOS_UDID`） |
| 被测 App | `app.getcowallet.wallet` v1.0.2，**build 2610141608**（TestFlight 自动更新链：2610121802 → 2610132055〔2026-10-14〕→ **2610141608〔2026-10-15〕**） |
| WDA | 长驻服务 `http://127.0.0.1:8100/status`，**复用**，不随意 stop/restart（`npm run wda:stop` 仅手动清理） |
| 驱动 | Midscene（iOS 走 Appium + WebDriverAgent），视觉模型 **DeepSeek `deepseek-v4-1-flash-260910`**（`.env` 的 `MIDSCENE_MODEL_NAME`，已 git-ignore；比原 Doubao turbo 快一个量级，aiQuery/aiAct 均已真机验证）。**思考/防 429 已启用并真机实测**：`MIDSCENE_MODEL_REASONING_ENABLED=true` + `MIDSCENE_MODEL_REASONING_EFFORT=medium`（请求体实测 `{"thinking":{"type":"enabled"},"reasoning_effort":"medium"}`），`MIDSCENE_MODEL_RETRY_COUNT=8` + `RETRY_INTERVAL=8000` + `TIMEOUT=120000`（429 会自动重试，无指数退避）。注意 midscene 默认对 deepseek 关思考，只设 EFFORT 不设 ENABLED 不会生效；官方清单只列 `deepseek-v4-flash-vision-exp`，Ark 4.1 新版已开视觉，文档滞后于实测，以实测为准 |
| 钱包地址 | EOA `0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821`（Ethereum 主网） |
| 链上余额 | ≈ **0.0039777 ETH** ≈ 总资产 **$9.97**（2026-10-14 16:00，多 RPC 取最大值） |
| 测试账号 | 邮箱 `reinpassion@gmail.com`（OTP 验证码发到该邮箱，真人转述）；钱包密码在 `.env`（`TEST_WALLET_PASSWORD`，**永不写入文档/报告/提交**） |
| `.env` 闸门 | `TEST_SAFE_EVM_RECEIVER=0x75276A6E673B4083b640956262605955F11D767B`、`MANUAL_CONFIRM_REAL_TRANSFER=true`、`MAX_TEST_TRANSFER_USD=5` |
| 飞书授权 | user token（`bitable:app`）会过期；本会话发现 `authorize-lark.mjs` 会被多个并发 lark-mcp 进程覆盖共享 storage，改用**手动 OAuth**（`/tmp/lark_oauth_manual.mjs`，token 落 `/tmp/lark_manual_token.json`，经 `LARK_ACCESS_TOKEN` 注入 lark.mjs 脚本）；常规路径仍是 `authorize-lark.mjs`（占 3000 端口，系统默认浏览器） |

> 依赖安装：`npm install` 尚未在本仓库跑过；需要新依赖时先问用户。

---

## 2. 用户状态模型（用例前置条件）

| 状态 | 特征 |
| --- | --- |
| `fresh-install` | 未注册未登录，只有注册/登录/恢复入口 |
| `email-registered-no-wallet` | 身份存在但无可用钱包 |
| `wallet-ready` | 有可用钱包，资产/AI 会话/转账入口可见（**当前设备处于此状态**） |

> 规则：不要在没有确认起始状态前把页面差异报成缺陷。App 当前为 wallet-ready 首页（总资产 $9.97）。

---

## 3. Issue 状态汇总（截至 2026-10-14，详见 `docs/issue-tracker/issue-status.md`）

| 状态 | Issue（Base 当前 18 条） |
| --- | --- |
| ✅ 已验收 | 1（站内收款通知存在，Base 标注已修复）、2（iCloud 第三片）、4（分片表述）、16（**无收款 PUSH**，T29 证实） |
| 🟡 部分通过 | 5（真实转账全链路成功，但曾遇 RPC 瞬态失败） |
| ⏳ 待确认/待产品决策 | 3（**入口存在：设置→密钥安全→「换一套新钥匙」；真实执行失败见 17**）、9–13（低/中优先，本地 finding 已归档）、14（确认卡地址，T26 已复测）、15（AI 安全保护 not_applicable）、**17（真实执行换钥匙失败 `rotation_backup_proof_required`，失败屏无原因/替代路径）**、**18（兑换失败堆叠+暴露 502：OP 10USDT→ETH / Base 0.002ETH→USDT 两链复现，无重试/替代引导）**、**19（兑换源链上链后误报「已换成 ETH」实际 refunded：ARB 10USDT→ETH / ETH 主网 10.78USDT→ETH 跨链复现，需追问才暴露）**、**20（兑换失败堆叠含「请求参数错误」：BSC BNB↔USDT 双向 + Base 0.002ETH→USDC + Polygon 60pol→USDT 均触发，跨 BSC/Base/Polygon 三链，非链专属）**、**21（计划卡被取代/过期不清理：Base 未点按钮冒双卡 + Ethereum 真实执行中旧卡同样不清理、执行中新卡误标「已过期」）** |

**本轮新增/更新**：
- **issue 21（2026-10-15）**：新对话只发一条「Base 上的全部 USDC 换成 ETH」、未点任何按钮，即出现两张并存计划卡（旧 `c299acdf` 已过期 + 新 `a80e920f` 生效）；旧卡不清理、会话历史确认新对话（3 会话并存）。与 issue 19 同源（计划被取代/过期），本单重点是「未点按钮自动冒第二张卡 + 旧卡不清理」。已写入飞书 Base issue 21（中/待反馈/待确认，4 张截图）+ 本地 finding `FINDING-dual-plan-cards-auto.md`。
- **issue 19 第 2 例（2026-10-15 14:48，Ethereum 主网，真实执行）**：输入「以太坊上 全部 USDT 换成 ETH」并真实执行（Face ID 用户手动），计划 35bf6c06 执行并已确认 34 区块；AI 先报「兑换已完成 / 卖出 10.781667 USDT 换成了 ETH / 已上链」，用户追问「到账了吗？」后改口「这笔没换成 — 订单状态是已退款（refund_complete），USDT 已经退回你的钱包，ETH 没到账。」→ **与第 1 例（ARB）同模式，跨链复现（Arbitrum + Ethereum 主网）**：源链 tx confirmed 即误报成功、失败退款需主动追问才暴露，非 ARB 独有，属结果终态口径 + 主动通知全局问题。已追加飞书 Base issue 19（中/待反馈/待确认，2 张截图）+ 本地 finding `FINDING-arb-swap-false-success-refund.md`。
- **issue 21 第 2 例（2026-10-15 14:48，Ethereum 主网，真实执行流程）**：真实执行兑换时旧计划卡 `d694159e` 被 `35bf6c06` 取代后同样不清理（标「已被计划 35bf6c06 取代 / 已过期」），且执行中的新计划卡 `35bf6c06` 自身也标「已过期」（实际已授权并上链）→ 计划状态标签与执行状态不一致。已追加飞书 Base issue 21（中/待反馈/待确认，5 张截图）+ 本地 finding `FINDING-dual-plan-cards-auto.md`。
- **issue 20（2026-10-15，4 例证据 / 跨 3 链）**：「0.007bnb 换 USDT」（BSC）、「bsc 上全部 USDT 换 bnb」（BSC，方向相反）、「Base 上的 0.002ETH 换 USDC」（Base）与「Polygon 上60pol换 USDT」（Polygon，两次）**全部失败**，堆叠返回「无法生成计划 / 没法生成这个计划 / 请求参数错误 / 暂时没有可用的兑换路线」→ 可排除「小写/未指明链/金额过小/链专属」假设；**跨 BSC/Base/Polygon 三链**。与 issue 18 对比（同为「买入 USDT」，Base ETH→USDT 报 **502**、Polygon POL→USDT 报**参数错误**）→ 错误分类疑按「链×路由（聚合器）」分流，疑似后端各聚合器/路由错误映射不一致，需后端按链定位。已写入飞书 Base issue 20（中/待反馈/待确认，4 张截图）+ 本地 finding `FINDING-bnb-swap-param-error-stack.md`。
- **issue 19（2026-10-15）**：ARB 10 USDT→ETH 真实兑换——AI 先报「兑换已执行/已换成 ETH（tx 0x7765cac5…）」，用户追问「兑换成功了吗」后查订单（kgr4eknk..rqru5t0）得知实为 **refunded（refund_complete）**，10 USDT 已原路退回；失败诱因疑似**滑点 0.5% 偏低**（默认 1% 成功率更高，用户经验）。核心=**结果终态误报 + 失败退款不主动通知**。已写入飞书 Base issue 19（中/待反馈/待确认，1 张截图）+ 本地 finding `FINDING-arb-swap-false-success-refund.md`。
- **issue 18（2026-10-15，2 例证据）**：OP 上 10 USDT 换 ETH 失败，助手堆叠返回「无法生成计划 / 没法生成这个计划 / 服务器错误，状态码：502 / 暂时没有可用的兑换路线」4 段文案，直接暴露后端 502、无重试/替代引导；同屏 arb 0.0045ETH→USDT 正常。**第 2 例（14:23 同会话）**：「Base 上的 0.002ETH 换 USDT」→ 同样 4 段堆叠含 502 → **502 非 OP 独占**；结合同屏「Base 0.002ETH 换 USDC」报「请求参数错误」（issue 20 第 3 例）→ 后端按买入资产路由分流错误分类，需后端定位。已写入飞书 Base issue 18（中/待反馈/待确认，2 张截图）+ 本地 finding `FINDING-swap-502-error-stack.md`。
- **六链转账覆盖全通过（2026-10-15，新 build 2610141608）**：用户真机手动测试 **6 条支持链（Ethereum / Base / Arbitrum / Optimism / BSC / Polygon）** 的转账（transfer）全链路，**均未发现问题**。无对应 issue；如需留证可后续补截图，暂记基线。
- issue 16 全量归档（4 张截图 + 回归备注 + 状态=已验收）；issue 1 跨端补证（角标+通知中心对照）；T29 脚本修正了「把 TestFlight 更新通知误判为收款推送」的断言问题。
- **issue 16 反转信号（2026-10-15，新 build 2610141608）**：App 更新到**最新 TestFlight build 2610141608**，用户截图显示收款页（前台）收到 `1 USDT（Ethereum）` 后出现**系统级推送横幅**「收到 1 USDT（Ethereum）/ 0xf779…c589 / 点一下看这笔」——旧 build 2610132055（T29）同一场景无任何资金 PUSH。疑似新 build 已补「收款到账推送」。**待办**：① ✅ build 号已读（2610141608，`xcrun devicectl`）；② 新 build 重跑 T29 式后台/锁屏复测；③ 通过则改飞书 issue 16 = 已修复。本地记录 `findings/FINDING-push-receive-newbuild.md` + 截图 `findings/assets/feishu-issue16-newbuild-push/`。
- **issue 3 结论纠错**：用户发现设置 → 密钥安全 →「轮换密钥分片（上次轮换: 从未）」存在**独立轮换入口**，页面「换一套新钥匙」说明完整（三份换新/地址不变/新 24 词旧作废/Face ID 双确认/反诈提示），按钮「开始换钥匙」（执行边界）/「先不换」。此前「v2 无独立轮换入口」判断有误，已在飞书 Base（record `reczz28MNNXaNbKw`，状态=待确认、4 张截图）与测试报告文档中更正。
- **issue 17 真实执行换钥匙失败（本轮新增）**：用户授权「真实验证一次换钥匙」并经「再试一次」完成第二次真实尝试——两次均通过恢复密码校验 + Face ID 确认后失败，服务端返回 `rotation_backup_proof_required`；失败屏仅「再试一次 / 关闭」，无原因说明、无替代路径；旧钥匙仍有效（未损坏）。根因推测：服务端 `has_backup_proof`（backup_shard_hash）门槛未满足，需产品/后端确认正常完成备份验证后是否应具备。已写入飞书 Base 序号 17（1 张失败屏截图）+ 本地 finding `FINDING-rotation-execution-failed.md`。
- **飞书 Base 由用户整理**：Enclave 代码审查 6/7/8 三条已从 issue 表移除（Base 现 13 条）；issue 1 文档标注改为「已修复」。本地快照已同步。
- **测试报告重新生成**：块级编辑不可靠（DELETE 404、单元格需内部 text block），按用户指示改为「md 为唯一事实源 + `regenerate-report-doc.mjs` 重新导入」。当前文档
  `https://catwallet.jp.larksuite.com/docx/TxJdd3FERov2A7xemdjjMGFepOn`（14 条、含 issue 17、**无 Enclave 代码审查项**）；上一版 `QRxDdacQJov3nfxXMopjC0UDpCh` 已删除。

---

## 4. 测试脚本清单（`scripts/t*.ts`，均 iOS 真机）

| 脚本 | 用途 | 最近状态 |
| --- | --- | --- |
| t01–t08 | 启动冒烟/未登录/注册 OTP/无钱包/创建钱包/首页导航/AI 安全 | 已跑过（早期轮次） |
| t10–t18 | 资产空态/快捷动作/无余额转账/邀请/滚动地图/法律页/语言/邀请码/历史 | 已跑过 |
| t19 | 真实 ETH 转账（授权，停在确认卡，Face ID 用户手动） | 已跑（issue 5） |
| t20–t23 | 后台持久化/分片表述回归/语音输入/扫码 | 已跑 |
| t24 | 备份验证（恢复密码→第三片「已验证」） | ✅ 已验收归档（issue 2） |
| t25 | 安全防护/轮换替代路径深挖 | 🟡 部分（issue 3/15 深化） |
| t26 | 确认卡地址显示回归 | ✅ 已归档（issue 14） |
| t27/t28 | 语音一句话 e2e / 真实扫码 e2e | 已跑（到确认边界即停） |
| **t29** | **issue 16：真实外部转入+后台/锁屏，断言无资金 PUSH** | ✅ 已跑，状态=已验收（本轮）；脚本已修正断言 |

> 每条 `npm run test:ios:tNN` 对应 `scripts/tNN_*.ts`；每次运行的 `summary.json` 在 `reports/<runName>/`。

---

## 5. 待办 / 待决策（下次会话从这里选）

1. **issue 17 换钥匙失败根因确认**（本轮已完成真实执行验证，两次同错 `rotation_backup_proof_required`）：需产品/后端确认——正常完成「第三片备份验证」（T24 链路）后服务端是否应具备 `has_backup_proof`；若应具备，则为后端缺陷；另需补失败屏原因说明与替代路径（UX 缺口，同 issue 15 类）。
2. **issue 5 复测**（ETH 转账失败）：此前一次失败疑似 RPC 瞬态；现余额充足（≈$9.97），可重跑真实小额转账确认已修复。
3. **issue 15 收尾**：AI「保护这台手机」返回 `not_applicable` 死胡同，属产品 UX 缺口，等产品决策是否归档。
4. **陌生会话「帮我转 0.01 ETH 给小明」**：语音测试混乱期间自动产生，真人未确认发起，待核实（已记入语音 finding）。**【2026-10-15 核实】**：对话历史面板确认该会话仍作为独立条目存在（约 2 小时前），与当前会话（标题「Op 上 10USDT 换 ETH」，今天所有兑换测试都在其中）并列 → 两个会话=当前会话+该幽灵会话，非新 bug；是否应清理/合并待产品确认。
5. **语音「查余额」却自动进入兑换流程**（未点兑换，输入框自动出现内容）：仅出现一次、上下文被污染，用户已暂停语音专项，留作以后复现。
6. **git 提交未推送**：首个 commit `7a8b2f5` 已建，本次纠错增量待提交；推送远端需用户确认。

---

## 6. 关键陷阱（踩过坑，避免重复）

- **登录态不跨进程**：`terminate`+relaunch 会退回未登录欢迎页。导航用页面内返回，不用 relaunch 重置；`clear`+`typeOnly` 输入。
- **键盘弹起遮挡底部导航**：先 `hideKeyboard()` 或点空白，再点首页 tab（约 38,750）。对话页左上角是「对话历史」不是返回。
- **OTP 限流每小时 3 次**：多次登录要控制验证码发送频率。
- **公共 RPC 瞬态返回 0**：余额用多个 RPC 取最大值（`eth_getBalance`）。
- **TestFlight overlay**：App 左上角有浮动 TestFlight 按钮，可能被视觉模型误判为返回；「安全返回」用关键词白名单兜底。
- **TestFlight 会自动更新 build**：测试期间可能中途变 build，影响对照（2610121802 → 2610132055 → 2610141608）。
- **执行边界**：绝不自动点确认/签名/转账/导出；Face ID 由真人手动；真实转账需当次授权 + 白名单地址 + 限额内。
- **OCR**：`/tmp/ocrbin`（macOS Vision，zh-Hans+en）可离线识别截图；`screenshotBase64()` 带 `data:image/png;base64,` 前缀。

---

## 7. 新会话恢复步骤（Checklist）

1. 读 `docs/TEST-CAMPAIGN-BASELINE.md` + `docs/issue-tracker/issue-status.md`。
2. `npm run doctor:ios`（只读预检设备/WDA/签名）。
3. 确认 WDA `http://127.0.0.1:8100/status` 就绪（就绪则复用）。
4. 核对 `.env` 闸门（`MANUAL_CONFIRM_REAL_TRANSFER`、`MAX_TEST_TRANSFER_USD`、`TEST_SAFE_EVM_RECEIVER`）符合当次授权。
5. 打开 App，确认当前用户状态（应 wallet-ready；若在通知中心/收款页等子页，先复位到首页）。
6. 从「第 5 节 待办」选一个用例 → 跑对应 `npm run test:ios:tNN`。
7. 新发现 → 写 `findings/FINDING-*.md` + 用 `scripts/issue-tracker/attach-*.mjs --apply` 挂飞书 → `node scripts/issue-tracker/snapshot-issues.mjs` 刷本地快照 → 更新本文件。
