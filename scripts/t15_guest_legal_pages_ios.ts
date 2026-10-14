/**
 * T15 iOS 引导页法律条款可达性：确认 fresh-install 引导页上的
 * 「服务条款」「隐私政策」入口可打开、内容可读、可安全返回。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install（欢迎页或介绍页均可）；WDA 已就绪
 * 风险等级：🟢 只读。仅打开条款页并返回，不提交任何表单。
 *
 * 运行：npm run test:ios:t15
 */

import 'dotenv/config';

import {
  APP_ID,
  createIosAgent,
  createRunContext,
  detectUserState,
  runTest,
} from './lib/cowallet.ts';
import {
  assertVisible,
  captureScreen,
  errorToString,
  launchApp,
  sleep,
  tapVisibleText,
} from './lib/device-kit.ts';

type LegalPageState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasBackButton: boolean;
  backLabel: string | null;
};

const LEGAL_PAGES = [
  { entry: '服务条款', id: 'terms', title: '服务条款' },
  { entry: '隐私政策', id: 'privacy', title: '隐私政策' },
] as const;

async function inspectLegalPage(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  pageId: string,
): Promise<LegalPageState> {
  return agent.aiQuery<LegalPageState>(
    [
      `观察当前 cowallet iPhone 界面（页面：${pageId}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组（尤其是标题与正文开头）；',
      'hasBackButton：是否有返回/关闭按钮；backLabel：其精确文案，没有则 null。',
      '只观察描述，不要点击。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t15-guest-legal-pages-ios');
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

      await launchApp(agent, APP_ID.ios);
      const startState = await detectUserState(agent);
      summary.startState = startState;
      console.log(`[state] ${startState.state} — ${startState.evidence}`);
      if (startState.state === 'wallet-ready') {
        throw new Error('T15 需要未登录起始状态，实际为 wallet-ready。');
      }

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      const pages: Record<string, LegalPageState> = {};

      for (const page of LEGAL_PAGES) {
        // 每次从引导页重新进入对应条款页（T15 内逐条打开后返回，保持起始态可控）。
        await tapVisibleText(agent, page.entry, 2000);
        const state = await inspectLegalPage(agent, page.id);
        pages[page.id] = state;

        await captureScreen(
          agent,
          `T15 ${page.title} 页`,
          `从引导页打开 ${page.title}。`,
          [
            `Page: ${state.screenPurpose}`,
            `Texts: ${state.visibleTexts.join(' | ') || 'none'}`,
            `Back: ${state.backLabel ?? 'none'}`,
          ].join('\n'),
        );

        const contentAssert = await assertVisible(
          agent,
          `当前页面是 ${page.title} 相关的内容页，有可读的条款/政策正文或标题，不是空白页。`,
          `${page.title} 入口没有打开可读内容页。`,
        );
        assertions.push({ name: `${page.id}-page-openable`, ...contentAssert });

        // 安全返回引导页。
        if (state.hasBackButton && state.backLabel) {
          await tapVisibleText(agent, state.backLabel, 1500);
        } else {
          // 返回按钮缺失：relaunch 回起始态并重定位引导页入口。
          console.log(`[t15] ${page.title} 页无返回按钮，relaunch 回起始态。`);
          try {
            await agent.terminate(APP_ID.ios);
          } catch {
            // ignore
          }
          await sleep(800);
          await launchApp(agent, APP_ID.ios);
          await sleep(1000);
        }
      }

      const endState = await detectUserState(agent);
      summary.endState = endState;
      console.log(`[state] end ${endState.state} — ${endState.evidence}`);

      summary.pages = pages;
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
