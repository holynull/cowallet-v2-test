/**
 * T06 iOS wallet-ready 首页与导航：确认底部导航三 tab（首页 / 钱包 / 设置）
 * 均可达、切换后页面状态正确。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready（钱包已创建、备份完成）
 * 风险等级：🟢 只读。只切换 tab 与观察，不触碰转账/签名/导出密钥等入口。
 *
 * 运行：npm run test:ios:t06
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, detectUserState, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type TabState = {
  tab: string;
  screenPurpose: string;
  visibleTexts: string[];
  hasRiskEntry: boolean;
  riskLabels: string[];
};

const TABS = ['首页', '钱包', '设置'] as const;

async function inspectTab(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  tab: string,
): Promise<TabState> {
  return agent.aiQuery<TabState>(
    [
      `观察当前 cowallet iPhone 界面（底部导航 tab：${tab}）。返回 JSON：`,
      'screenPurpose：一句话说明这个 tab 的页面用途；',
      'visibleTexts：主要可见文案数组（最多 12 条）；',
      'hasRiskEntry：页面是否直接展示转账/兑换/签名/导出密钥/删除等高风险执行入口；',
      'riskLabels：若有，列出这些高风险入口的可见文案。',
      '只观察描述，不要点击。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t06-home-nav-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;

    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();

      await sleep(1500); // 直接连上当前 wallet-ready 界面
      const startState = await detectUserState(agent);
      summary.startState = startState;
      console.log(`[state] ${startState.state} — ${startState.evidence}`);
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T06 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      const tabs: TabState[] = [];
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      for (const tab of TABS) {
        await tapVisibleText(agent, tab, 2500);
        const state = await inspectTab(agent, tab);
        tabs.push(state);
        await captureScreen(
          agent,
          `T06 - ${tab} tab`,
          `wallet-ready 状态下 ${tab} tab 页面。`,
          [
            `Tab: ${tab}`,
            `Purpose: ${state.screenPurpose}`,
            `Texts: ${state.visibleTexts.join(' | ') || 'none'}`,
            `Risk entries: ${state.riskLabels.join(' | ') || 'none'}`,
          ].join('\n'),
        );

        // 断言：tab 可达且不是空页/崩溃。
        assertions.push({
          name: `${tab}-tab-reachable`,
          pass: state.visibleTexts.length > 0 && Boolean(state.screenPurpose),
          message: state.screenPurpose,
        });
      }

      // 切回首页确认状态稳定。
      await tapVisibleText(agent, '首页', 2000);
      const backHome = await inspectTab(agent, '首页-back');
      assertions.push({
        name: 'back-to-home-stable',
        pass: backHome.visibleTexts.length > 0,
        message: backHome.screenPurpose,
      });

      summary.tabs = tabs;
      summary.assertions = assertions;
      summary.status = assertions.every((a) => a.pass) ? 'passed' : 'failed';
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
