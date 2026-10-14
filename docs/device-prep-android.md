# Android 真机准备

目标：把一台安卓真机变成可被 Midscene 稳定驱动的测试设备，并确认被测 App 已安装且版本可追溯。

## 1. 手机端一次性设置

1. 打开**开发者选项**（设置 → 关于手机 → 连续点击"版本号"7 次）。
2. 打开 **USB 调试**；如果系统有"USB 安装"，也一并打开，否则 `adb install` 会被拒绝。
3. 设置**屏幕锁定**（PIN / 密码 / 生物识别）。钱包的签名、恢复、导出密钥流程会依赖系统锁屏，没有锁屏就无法覆盖这些路径。
4. 建议打开**屏幕常亮**（开发者选项里通常有），并关闭自动锁屏；锁屏后截图会变成锁屏界面，AI 只能读到系统 UI。
5. 可选：把 **窗口/过渡/Animator 动画缩放调成 0.5x 或关闭**。动画会拖慢截图后的稳定判定，容易造成偶发定位失败。

## 2. 电脑端

`adb` 来自 Android platform-tools，本机路径：`/Users/zhangleping/Library/Android/sdk/platform-tools/adb`。
如果不在 `PATH` 里，在 `.env` 里设置 `ADB_BIN` 指向绝对路径。

## 3. 连接与授权

1. 用数据线连接手机，手机上会弹出 **"允许 USB 调试吗？"** → 勾选"一律允许"并同意。
2. 核对连接状态：

```bash
npm run doctor:android            # 不主动拉起 adb server
npm run doctor:android -- --probe # 允许启动 adb server 后再查
adb devices -l
```

`adb devices` 的状态含义：

| 状态 | 含义 | 处理 |
| --- | --- | --- |
| `device` | 已授权可用 | 正常，继续 |
| `unauthorized` | 手机上没点授权 | 在手机屏幕上确认授权弹窗 |
| `offline` | 连接异常 | 重新插拔数据线，或 `adb kill-server && adb start-server` |
| `no permissions` | Linux udev 权限问题 | 配置 udev 规则（macOS 一般不会出现） |

连接多台设备时**必须**在 `.env` 里固定 `ANDROID_DEVICE_ID=<serial>`。测试脚本在目标不唯一时会直接报错退出，这是有意设计，避免静默跑错机器。

## 4. 安装被测包

安装会改变设备状态，属于需要明确授权的动作；`doctor` 和 smoke 脚本都不会自动安装。

```bash
# 先用 --dry-run 类的方式确认包信息（可选）
adb -s <serial> shell pm path com.cowallet.app

# 安装（示例；把路径换成实际的 v2 构建产物）
adb -s <serial> install -r /path/to/cowallet-v2-<version>.apk
```

本机历史 APK 参考位置：`../cowallet/blackbox-device-tests/*.apk`（v1.0.1/v1.0.2 测试包），v2 包需要你提供或从 `../cowallet/mobile` 构建。

安装后确认版本，便于缺陷报告可追溯：

```bash
adb -s <serial> shell dumpsys package com.cowallet.app | grep -E 'versionName|versionCode'
```

## 5. 跑只读冒烟

```bash
npm run test:android:smoke
```

脚本会：确认真机唯一且可用 → 确认 `com.cowallet.app` 已安装并读取版本 → 启动 App → 截图 → 判断用户状态 → 断言首屏渲染正常。产物在 `reports/<时间戳>-t01-smoke-android/`。

## 6. 常见问题

- **截图是黑屏/锁屏**：设备锁屏了。解锁并保持亮屏。
- **输入中文失败**：Midscene 对特殊字符会自动走 yadb 通道；如果仍失败，确认 `adb shell` 能正常执行，并避免在同一个输入框里混用中英文长文本。
- **定位不稳/点错位置**：先确认屏幕分辨率没有被系统"显示大小"缩放；`wm size` 与 `wm density` 会记录在 `summary.json` 里，可作为对照。
- **adb server 相关报错**：先 `adb kill-server`，再 `npm run doctor:android -- --probe`。
- **应用行为异常**：先核对用户状态（fresh-install / email-registered-no-wallet / wallet-ready），再判断是不是缺陷；不同起始状态下页面本来就不同。
