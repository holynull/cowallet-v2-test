# iOS 真机准备

目标：把一台 iPhone 变成可被 Midscene（经 WebDriverAgent）稳定驱动的测试设备，并确认签名、端口转发与会话都就绪。

## 1. 前置条件

| 项 | 要求 | 本机现状 |
| --- | --- | --- |
| 数据线 | 能传输数据，不是只能充电的线 | — |
| Xcode | 已安装完整版；版本需 ≥ 设备 iOS 版本 | Xcode 26.5（Build 17F42） |
| 开发者模式 | 设置 → 隐私与安全性 → 开发者模式 → 打开并重启 | 需在设备上确认 |
| Apple ID | 免费账号也可签名 WDA，但需要 Xcode 里登录过 | 钥匙串里有 1 个 Apple Development 身份 |
| `iproxy` | USB 端口转发（来自 libusbmuxd） | 已安装：`/usr/local/bin/iproxy` |
| Appium | 部分 iOS 场景需要 | 已安装：3.3.0 |

## 2. 连接与信任

1. 用数据线连接 iPhone，解锁屏幕。
2. 手机上弹出 **"要信任此电脑吗？"** → 信任并输入锁屏密码。
3. 核对：

```bash
npm run doctor:ios
idevice_id -l                       # 应列出 USB 已连接设备的 UDID
xcrun devicectl list devices        # 概览：已连接 / 未连接
```

`doctor` 用 `idevice_id` 的 UDID 校验 `IOS_UDID`；`devicectl` 只作概览，因为未连接设备在那里显示的是 UUID 而不是 UDID。

`.env` 里 `IOS_UDID` 是**必须显式固定**的，脚本不会自动挑设备。

## 3. 启动 WebDriverAgent

WDA 是本机长驻服务，跑测试前先确认 `/status` 是否已就绪：

```bash
npm run wda:check    # 只检查条件（签名身份、项目路径、设备在线），不启动
npm run wda:start    # 未就绪时才需要；会编译并签名 WebDriverAgent（首次较慢）
curl -s http://127.0.0.1:8100/status
```

说明：

- `start-wda.sh` 会 `xcodebuild build-for-testing` → 修复内嵌 framework 签名 → 启动 `iproxy` 端口转发 → `test-without-building` 拉起 WDA 会话。
- WDA 已经 ready 时脚本直接复用，不会重复编译。
- **不要在测试前后自动停 WDA**：复用能省几分钟；只在你需要显式清理时执行 `npm run wda:stop`。
- smoke 脚本在 WDA 未就绪时会自动执行 `npm run wda:start`；不想让它自动编译/签名就把 `.env` 里的 `WDA_AUTOSTART` 设为 `false`。

## 4. 安装被测 App

安装 IPA 属于设备变更动作，不在自动流程里，需要你自行选择方式：

- Xcode 直接 Run 或 `Window → Devices and Simulators` 拖入 `.ipa`；
- TestFlight / Ad-Hoc 分发；
- 保持与后端环境匹配的构建（dev / prod 配置不同，`ios/Runner.xcodeproj` 的 bundle id 是 `com.cowallet.app`）。

## 5. 跑只读冒烟

```bash
npm run test:ios:smoke
```

脚本会：校验 `IOS_UDID` → 复用或启动 WDA → 连接会话 → 启动 App → 截图 → 判断用户状态 → 断言首屏渲染正常。产物在 `reports/<时间戳>-t01-smoke-ios/`。

## 6. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `No Apple Development codesigning identity found` | Xcode 未登录账号 / 证书缺失 | Xcode → Settings → Accounts 登录，并创建开发证书 |
| `Developer Mode is not enabled` | 设备未开开发者模式 | 设置 → 隐私与安全性 → 开发者模式 → 重启 |
| WDA 编译成功但连不上 8100 | `iproxy` 未启动或端口被占用 | `lsof -i :8100` 检查；`brew install libusbmuxd` |
| `productType` / 设备锁屏类错误 | 设备锁屏 | 解锁并保持亮屏 |
| 内嵌 framework 签名报错 | derived data 陈旧 | 清掉 `WDA_DERIVED_DATA_PATH` 重新 `npm run wda:start`（脚本会尝试自动修复签名） |
| 突然连不上、需要重新信任 | 系统重启或换线 | 重新信任电脑，`idevice_id -l` 确认设备在线 |

## 7. 与 Android 的差异（写用例时要注意）

- iOS 的系统弹窗（Face ID、通知、相册）需要单独处理，不能和 Android 用同一套预期。
- iOS 返回手势/返回按钮与 Android 物理返回键不同，脚本里不要共用"返回"语义。
- 两个平台的页面文案偶尔不一致，发现差异先记录（可能是特性也可能是不一致），不要强行对齐断言。
