/**
 * T29 iOS issue 16 复测：收款到账是否有 PUSH/锁屏推送（后台/锁屏场景）。
 *
 * 背景：issue 16 —— 收款到账无 PUSH/锁屏推送，仅有站内铃铛通知。
 * 源码佐证：mobile PushType 枚举仅 tx_confirmed/tx_failed/security_alert/mpc_sign_request，
 * 无「收款到账」类型；backend 仅在 mpc_sign_request 时经 /push/send 发送。→ 预期收款场景无 PUSH。
 *
 * 本用例（🟡 只读 + 后台化 + 真人外部转入）：
 *   1. 清理并回到首页，记录链上 ETH 余额（Ethereum 主网 RPC）。
 *   2. 按 Home 键把 App 后台化（设备保持解锁）。
 *   3. 提示真人从外部钱包向本钱包地址转 0.0005 ETH（收款，非本 App 转出）。
 *   4. 轮询 RPC 余额，检测到账（余额增加=链上确认）。
 *   5. 下拉通知中心截图，检查是否有 PUSH（预期无「收到/到账」类推送）。
 *   6. 重新打开 App，检查站内铃铛角标/通知中心（对照）。
 *
 * 安全边界：本用例只有「收款」发生（资金进账），本 App 不转出任何资金；
 * 不点任何确认/签名/批准按钮。真人从外部转入是用户自己的资金操作。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟢（仅收款观察 + 后台化；外部转入由用户操作）
 *
 * 运行：npm run test:ios:t29
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep } from './lib/device-kit.ts';

const WALLET_ADDR = '0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821';
const INCOMING_ETH = '0.0005';
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com',
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
];

/** 通过多个公共 RPC 读取地址 ETH 余额（wei），取所有成功响应的最大值，规避瞬态错误。 */
async function fetchEthBalanceWei(): Promise<bigint | null> {
  let best: bigint | null = null;
  for (const rpc of RPC_URLS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBalance',
          params: [WALLET_ADDR.toLowerCase(), 'latest'],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { result?: string };
      if (data.result && /^0x[0-9a-fA-F]+$/.test(data.result)) {
        const v = BigInt(data.result);
        if (best === null || v > best) best = v;
      }
    } catch {
      /* try next rpc */
    }
  }
  return best;
}

type CleanState = {
  screenPurpose: string;
  onHome: boolean;
  hasHistoryPanel: boolean;
  hasKeyboard: boolean;
  visibleTexts: string[];
};

async function main(): Promise<number> {
  const ctx = await createRunContext('t29-push-receive-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
    walletAddress: WALLET_ADDR,
    incomingEth: INCOMING_ETH,
  };

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;

    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();
      await sleep(1500);

      // 1) 清理：关历史面板 / 收键盘 / 回首页。
      let clean: CleanState | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        clean = await agent.aiQuery<CleanState>(
          '返回 JSON {screenPurpose, onHome: 是否在首页(有 发送/接收/扫码 或 总资产), hasHistoryPanel: 是否有对话历史弹层, hasKeyboard: 键盘是否弹起, visibleTexts}。只观察。',
        );
        if (clean.onHome && !clean.hasHistoryPanel && !clean.hasKeyboard) break;
        if (clean.hasHistoryPanel) {
          try { await agent.aiTap('the 关闭（×）button on the history panel', { deepLocate: true }); await sleep(1200); } catch { /* ignore */ }
        }
        if (clean.hasKeyboard) {
          try { await agent.page.hideKeyboard(); await sleep(1000); } catch { /* ignore */ }
          try { await agent.page.tap(187, 120); await sleep(800); } catch { /* ignore */ }
        }
        try { await agent.page.tap(38, 750); await sleep(1200); } catch { /* ignore */ }
      }
      const startState = await agent.aiQuery<{ state: string; evidence: string }>(
        '观察当前 cowallet 首页，判断用户状态。返回 JSON {state: fresh-install/email-registered-no-wallet/wallet-ready/unknown, evidence}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T29 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }
      await captureScreen(
        agent,
        'T29 起始首页',
        '测试起始首页（wallet-ready）。',
        `State: ${startState.state}\nPurpose: ${clean?.screenPurpose ?? ''}`,
      );

      // 2) 记录链上余额（before）。
      const beforeWei = await fetchEthBalanceWei();
      summary.balanceBeforeWei = beforeWei?.toString() ?? null;
      console.log(`[t29] 链上余额（before）: ${beforeWei === null ? 'RPC 不可用' : Number(beforeWei) / 1e18 + ' ETH'}`);
      if (beforeWei === null) {
        throw new Error('无法读取链上余额（公共 RPC 均失败），终止。');
      }

      // 3) 后台化 App（按 Home）。
      try {
        await agent.page.home();
        await sleep(2500);
      } catch (error) {
        console.log(`[t29] 后台化失败，尝试 appSwitcher 兜底：${errorToString(error)}`);
        try { await agent.page.appSwitcher(); await sleep(2000); } catch { /* ignore */ }
      }
      console.log(
        `\n✅ 请现在从**外部钱包**向本钱包地址转 ${INCOMING_ETH} ETH（约 $1.3）：\n` +
        `   ${WALLET_ADDR}\n` +
        '   转完后告诉我「转了」，我会在链上确认到账后检查 PUSH 推送。\n',
      );

      // 4) 轮询链上余额，检测到账（最多 ~12 分钟）。
      let afterWei = beforeWei;
      // 需要至少 ~60% 的预期到账增量才判定「到账」，规避 RPC 瞬态波动。
      const minDeltaWei = BigInt(Math.round(Number(INCOMING_ETH) * 0.6 * 1e18));
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(20000);
        afterWei = await fetchEthBalanceWei() ?? afterWei;
        console.log(`[t29] 余额轮询: ${Number(afterWei) / 1e18} ETH`);
        if (afterWei >= beforeWei + minDeltaWei) break;
      }
      summary.balanceAfterWei = afterWei.toString();
      const received = afterWei >= beforeWei + minDeltaWei;
      console.log(`[t29] 到账检测: ${received ? '已到账' : '未检测到账'}（before=${Number(beforeWei)/1e18}, after=${Number(afterWei)/1e18} ETH）`);

      // 5) 下拉通知中心，检查 PUSH。
      if (received) {
        await sleep(15000); // 给推送留时间
      }
      try {
        // 从屏幕顶部下拉通知中心
        await agent.page.swipe(187, 6, 187, 700, 300);
        await sleep(2000);
      } catch (error) {
        console.log(`[t29] 下拉通知中心失败：${errorToString(error)}`);
      }
      const nc = await agent.aiQuery<{
        screenPurpose: string;
        isNotificationCenter: boolean;
        hasCowalletPush: boolean;
        pushTexts: string[];
        visibleTexts: string[];
      }>(
        '观察当前屏幕（应为 iOS 通知中心/锁屏或主屏）。返回 JSON：' +
        '{screenPurpose, isNotificationCenter: 是否通知中心, hasCowalletPush: 是否有 CoWallet 的推送通知, pushTexts: CoWallet 推送文案数组, visibleTexts}。只观察。',
      );
      summary.notificationCenter = nc;
      await captureScreen(
        agent,
        'T29 通知中心检查',
        '后台收款后下拉通知中心，检查是否有 CoWallet PUSH。',
        [
          `Purpose: ${nc.screenPurpose}`,
          `IsNC: ${nc.isNotificationCenter}`,
          `HasPush: ${nc.hasCowalletPush}`,
          `PushTexts: ${(nc.pushTexts ?? []).join(' | ') || 'none'}`,
          `Texts: ${(nc.visibleTexts ?? []).join(' | ')}`,
        ].join('\n'),
      );

      // 6) 重新打开 App，检查站内铃铛（对照）。
      try {
        await agent.launch(APP_ID.ios);
        await sleep(3500);
      } catch (error) {
        console.log(`[t29] 重新打开 App 失败：${errorToString(error)}`);
      }
      const app = await agent.aiQuery<{ screenPurpose: string; hasBellBadge: boolean; visibleTexts: string[] }>(
        '返回 JSON {screenPurpose, hasBellBadge: 首页右上角铃铛是否有红色未读角标, visibleTexts}。只观察。',
      );
      summary.appReopened = app;
      await captureScreen(
        agent,
        'T29 回到 App 检查站内铃铛',
        '重新打开 App，检查站内铃铛角标（对照：站内有/无通知）。',
        `Purpose: ${app.screenPurpose}\nBellBadge: ${app.hasBellBadge}\nTexts: ${(app.visibleTexts ?? []).join(' | ')}`,
      );

      // 7) 断言。
      // 区分「资金到账」推送与系统/TestFlight 更新通知：只有出现「收到/到账/收款/转入/ETH
      // 金额」等资金语义的推送才算 issue 16 失效；TestFlight 自动更新（“已是最新版本/
      // 已自动下载并安装”）和系统通知不计入。
      const FUNDS_PUSH_RE =
        /收到|到账|收款|转入|入账|已到账|received|receive|credit|deposit|0\.000\d*\s*ETH|ETH\s*0\./i;
      const pushTexts = (nc.pushTexts ?? []).map((t) => String(t));
      const fundsPushFound = pushTexts.some((t) => FUNDS_PUSH_RE.test(t));
      summary.fundsPushFound = fundsPushFound;
      summary.pushTextsClassified = pushTexts;

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [
        {
          name: 'funds-received',
          pass: received,
          message: `before=${Number(beforeWei)/1e18} after=${Number(afterWei)/1e18} ETH`,
        },
        {
          name: 'push-absent-confirms-issue16',
          pass: received && !fundsPushFound,
          message:
            `后台收款后通知中心资金推送判定 fundsPushFound=${fundsPushFound}` +
            `（pushTexts=${JSON.stringify(pushTexts)}）；` +
            `源码确认无收款推送类型（PushType 仅 tx_confirmed/tx_failed/security_alert/mpc_sign_request）` +
            `，backend 仅在 mpc_sign_request 时发 push → 无资金推送则 issue 16 成立`,
        },
        {
          name: 'no-execution',
          pass: true,
          message: '仅收款观察，未执行任何资金动作',
        },
      ];
      summary.assertions = assertions;
      summary.status = assertions.every((a) => a.pass) ? 'passed' : 'partial';
      summary.midsceneReport = agent.reportFile ?? null;
    } finally {
      await agent.destroy().catch((error: unknown) => {
        console.error(`[warn] agent.destroy 失败：${errorToString(error)}`);
      });
    }
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(errorToString(error));
    process.exit(1);
  });
