# cowallet-v2-test

CoWallet v2 手机端 App 的**真机黑盒测试工作台**。

技术栈：Midscene（视觉 / 自然语言驱动）＋ `adb`（Android）＋ Appium + WebDriverAgent（iOS），模型用豆包（火山方舟）。这个仓库只做测试，不改 App 生产代码。

被测产品特点决定了测试方式：CoWallet 是聊天优先的 AI 钱包，按钮点完之后往往会回到 AI 会话面，所以断言对象是**用户可见的界面与对话状态**（AI 回复、澄清提问、确认卡、取消路径、错误/空/加载态），而不是内部钱包状态。

## 目录结构

| 路径 | 用途 |
| --- | --- |
| `scripts/doctor.mjs` | 真机测试环境自检：设备、依赖、模型配置、WDA 状态 |
| `scripts/device/` | WDA 启停、Appium、Playground 等设备侧服务脚本 |
| `scripts/lib/device-kit.ts` | 与产品无关的 Midscene 设备动作原语（启动、点按、输入、截图、断言） |
| `scripts/lib/cowallet.ts` | cowallet 适配层：设备固定、run 目录、状态模型、安全边界 |
| `scripts/t01_smoke_android.ts` / `_ios.ts` | 只读冒烟：确认设备与首屏可读性 |
| `reports/` | 每次运行的 `summary.json`、Midscene HTML 报告、截图（默认不提交） |
| `findings/` | 需要长期追踪的问题草稿与证据截图 |
| `docs/` | 设备准备、用例规划 |

## 快速开始

```bash
# 1. 安装依赖（@midscene/android、@midscene/ios、tsx、appium-webdriveragent）
npm install

# 2. 本仓库 .env 已从 .env.example 生成；确认这几项
#    IOS_UDID / WDA_DEVELOPMENT_TEAM / MIDSCENE_MODEL_API_KEY
npm run doctor

# 3. 接上真机后重新自检
npm run doctor:android          # Android：adb 与设备状态
npm run doctor:ios              # iOS：UDID、WDA、签名身份
npm run doctor -- --probe       # 允许启动 adb server 再查设备列表

# 4. 跑只读冒烟
npm run test:android:smoke
npm run test:ios:smoke
```

Midscene 报告会写在 `reports/<时间戳>-<用例名>/` 下，同时生成 `summary.json`；运行日志里会打印报告路径。

需要手动探索界面时用 Playground：

```bash
npm run playground:android      # 基于 adb，不需要 Appium
npm run wda:start && npm run playground:ios
```

## 当前进度

| 项目 | 状态 |
| --- | --- |
| 工作台骨架（脚本 / 配置 / 文档） | ✅ 已就绪 |
| 模型连通性（豆包 `doubao-seed-2-1-turbo`） | ✅ 已验证，接口返回 200 |
| `npm install` | ⏳ 待执行（需要你确认后安装） |
| Android 真机 | ⏳ 未连接 |
| iOS 真机（WDA 会话） | ⏳ 未连接 / 未启动 |
| 被测 v2 安装包（APK / IPA） | ⏳ 未提供 |

## 设备准备

- Android：[docs/device-prep-android.md](docs/device-prep-android.md)
- iOS：[docs/device-prep-ios.md](docs/device-prep-ios.md)
- 首批用例规划：[docs/test-plan-v2.md](docs/test-plan-v2.md)

## 安全边界

钱包产品里"点到确认"就等于动真钱或暴露密钥，所以工作台默认把以下动作当作执行边界，脚本只走到边界之前并留下证据：

真实转账、兑换提交、代币授权（approve）、签名/广播交易、导出或查看助记词与私钥、删除账号、紧急冻结等不可逆安全状态变更。

对应地：

- `.env` 里的 `MANUAL_CONFIRM_REAL_TRANSFER=false`、`MAX_TEST_TRANSFER_USD=0` 是默认门禁；需要真实资金动作时必须当次明确授权。
- 助记词、私钥、密码、API Key 只通过本地 `.env` 提供，不写进脚本、不贴进 AI 提示词、不放进报告。
- App 安装/卸载、清数据、重装、恢复出厂这类设备变更不属于自动流程，需要单独确认。

## 与既有工程的关系

| 仓库 | 可复用什么 |
| --- | --- |
| `../cowallet/blackbox-device-tests` | v1.0.2 的真机测试工作台：100+ 个按旅程拆分的脚本、用户状态模型、findings → Linear 工作流。v2 用例从这里挑，不要从零重写。 |
| `../midscene-test-cw` | WDA / Appium 启停脚本（已复制到 `scripts/device/`）与三端脚本拆分经验。 |
| `../cowallet` | 被测 App 源码与后端（`mobile/`、`backend/`），只在需要确认环境或版本时查阅。 |

复用既有脚本时的路径差异：v1 脚本假定自己运行在 `blackbox-device-tests/` 根目录，移植过来后需要把 `rootDir`、`.env` 提示文案和 `start-wda.sh` 路径按本仓库结构调整。
