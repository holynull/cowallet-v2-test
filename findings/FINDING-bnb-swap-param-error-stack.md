## FINDING: 「0.007bnb 换 USDT」兑换失败：堆叠文案含「请求参数错误」，无明确原因与重试/替代引导（issue 20）

Status: local-draft
Linear: pending
Feishu: QVGLbx4zIauLNxsxPZYjHvSbpUh/tblQSxhJi3fb4ml7 序号 20（新增，待写入）
Project: CoWallet v2
Labels: RealDevice / UX-Gap / Error-Handling / Swap
Priority: Medium
Source: 用户提供真机截图（app.getcowallet.wallet v1.0.2 build 2610141608；2026-10-15 13:49）
Screenshots:
- findings/assets/feishu-issue20-bnb-param-error/bnb-007-swap-param-error.png（13:49 对话：0.007bnb 换 USDT → 4 段堆叠错误；同屏 ARB 第二次兑换 AI 主动提议查终态）
- findings/assets/feishu-issue20-bnb-param-error/bsc-all-usdt-to-bnb-param-error.png（13:58 当前屏幕实拍：bsc 上全部 USDT 换 bnb → 同样 4 段堆叠错误，含「请求参数错误」）
- findings/assets/feishu-issue20-bnb-param-error/base-eth-usdc-param-error.png（14:23 同会话：Base 0.002ETH 换 USDC → 同样「请求参数错误」堆叠）
- findings/assets/feishu-issue20-bnb-param-error/polygon-60pol-to-usdt-param-error.png（14:33 当前屏幕实拍：Polygon 60pol 换 USDT → 同样「请求参数错误」堆叠）

### 观察到

AI 聊天输入「**0.007bnb 换 USDT**」（BNB→USDT，未指明链，默认 BSC）后，助手一次性返回 4 段堆叠错误文案：

> 无法生成计划
> 没法生成这个计划
> 请求参数错误
> 暂时没有可用的兑换路线，稍后再试。

- 把后端「请求参数错误」这类内部错误直接抛给用户；
- 多段文案语义重复且矛盾（「请求参数错误」vs「没有可用的兑换路线」）；
- 无重试按钮 / 替代路径。

同屏对照（正向）：ARB 10 USDT→ETH **第二次**执行后，AI 主动提议「要不要我查一下这笔订单有没有真正到账？（上次就是执行了但被退款，所以这次确认一下更稳妥）」——对应 issue 19 的正向改善（记住了上次退款，主动回查终态）。

**14:23 复现（第 3 例，Base 链）**：同一会话输入「**Base 上的 0.002ETH 换 USDC**」（Base 链 ETH→USDC，与 BSC/BNB 无关）→ **仍返回「请求参数错误」堆叠** → 该错误**不局限于 BSC**，原「BSC BNB↔USDT 路径/小写 symbol 映射」假设需放宽。结合同屏「Base 0.002ETH 换 USDT」报「服务器错误，状态码：502」（见 issue 18 第 2 例）→ 后端按「买入资产路由」返回不同错误分类（USDC 买入→参数错误、USDT 买入→502），疑为后端各聚合器/路由错误映射不一致。

**14:33 复现（第 4 例，Polygon 链）**：当前屏幕新会话输入「**60pol换 USDT**」与「**Polygon 上60pol换 USDT**」**两次均失败**，返回同样「请求参数错误」堆叠 → 该错误**进一步覆盖 Polygon（POL→USDT）**。与 issue 18 第 2 例对照：同为「买入 USDT」，Base ETH→USDT 报 **502**、Polygon POL→USDT 报**参数错误** → 错误分类不仅按买入资产，更疑按「链×路由（聚合器）」分流，需后端按链定位各路由错误映射。

### 期望

- 兑换失败只给**一条**可理解的失败文案，区分「参数/余额不足 / 无可用路线 / 服务暂不可用」；
- 不暴露后端内部错误（如「请求参数错误」）；
- 提供重试按钮或明确下一步引导。

### 影响

中。失败时用户收到无法理解的错误堆叠（含「请求参数错误」），无法判断失败环节，也无直接重试出口；BNB 类非 ETH native 或小写币名路径更易踩到参数解析失败。

### 复现步骤

1. wallet-ready，App build 2610141608。
2. AI 聊天输入「0.007bnb 换 USDT」。
3. 观察助手回复：4 段堆叠文案，含「请求参数错误」。
4. （第 3 例）同会话输入「Base 上的 0.002ETH 换 USDC」→ 同样「请求参数错误」堆叠。
5. （第 4 例）同会话输入「Polygon 上60pol换 USDT」→ 同样「请求参数错误」堆叠。

**13:58 复现（第 2 例，方向相反）**：输入「bsc 上全部 USDT 换 bnb」（明确指定链 + 全部金额 + USDT→BNB）→ **同样**返回「请求参数错误」堆叠。

### 备注

- 与 issue 18（OP 10USDT→ETH，暴露「服务器错误，状态码：502」）同属「失败态文案堆叠、无出口」UX 家族。
- 四条独立触发（0.007bnb 换 USDT / bsc 上全部 USDT 换 bnb / Base 0.002ETH 换 USDC / Polygon 60pol 换 USDT×2）均报「请求参数错误」→ 可排除「小写/未指明链/金额过小/链专属」假设；**错误跨 BSC/Base/Polygon 三链**，且与 502（issue 18：Base ETH→USDT 同为买入 USDT 却报 502）对比 → 错误分类疑按「链×路由（聚合器）」分流，疑似后端各聚合器/路由的错误映射不一致，需后端按链定位。
