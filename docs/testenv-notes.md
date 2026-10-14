# iOS 真机测试环境注意点

## TestFlight overlay 会干扰视觉定位（重要）

**现象**：被测 cowallet 是 TestFlight 分发的测试构建（v1.0.2 build 2610121802）。
TestFlight 会在 App 界面左上角叠加一个**浮动 "TestFlight" 按钮**（返回箭头 + TestFlight 文字），
点击它会跳到 TestFlight App 列表页。

**对测试的影响**：
- Midscene 视觉模型可能把左上角 TestFlight 按钮误判为"返回/取消"等控件，导致自动点按脱轨。
- T03 首跑曾因此被带进 TestFlight 列表页（见 reports/2026-10-13T04-15-49-181Z-*/）。
- 处理方式：对"安全返回"类点按用关键词白名单兜底（返回/取消/关闭/Back/Cancel/Close），
  不匹配就 relaunch 回起始态，不盲点 AI 返回的任意 label。

**判断**：这是 TestFlight 分发的正常 overlay，不是 cowallet 产品缺陷；生产版本不应出现。
记录于此以避免后续重复排查。

## 引导流程进度跨重启持久化

点「开始使用」进入介绍页后，terminate + relaunch 不会回到欢迎首页，而是停留在介绍页
（fresh-install 判定仍成立，但子页面不同）。测试脚本起始状态判定需同时兼容
"欢迎页（开始使用）"和"介绍页（开始创建）"两种 fresh-install 子页面。
已归档：findings/FINDING-onboarding-progress-persists.md。

## 登录态不跨进程持久化（重要）

`agent.terminate()` + relaunch 后，App 回到**未登录欢迎引导页**，且邮箱登录页不记忆上次邮箱。
因此任何需要登录态的用例**不能靠 relaunch 重置**，必须在一次登录会话内完成，
返回用页面内返回按钮（或左上角坐标），否则登录态丢失需重新走邮箱 + OTP。
相关发现：findings/FINDING-no-wallet-back-loses-context.md（换邮箱返回丢上下文）。

## 邮箱验证码限流：每小时最多 3 次

触发验证码发送有频率限制：1 小时内最多 3 次，超出后提示
「验证码发送太频繁，请稍后再试（每小时最多3次）」，不进入 OTP 页。
自动化测试的多次登录必须控制验证码发送频率，避免同一小时反复触发。
已归档：findings/FINDING-otp-rate-limit.md。
