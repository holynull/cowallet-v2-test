/**
 * T16 iOS 引导/条款多语言切换：确认引导流程是否提供「中文 / English」语言切换，
 * 切换后界面文案随之变化、且可切回中文。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install（欢迎页或介绍页均可）；WDA 已就绪
 * 风险等级：🟢 只读。仅打开条款页做语言切换观察，不提交表单、不发送 OTP。
 *
 * 运行：npm run test:ios:t16
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

type LangState = {
  screenPurpose: string;
  visibleTexts: string[];
  language: 'zh' | 'en' | 'unknown';
  hasLanguageSwitch: boolean;
  switchLabels: string[];
};

async function inspectLanguage(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  label: string,
): Promise<LangState> {
  return agent.aiQuery<LangState>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${label}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组（前 15 条即可）；',
      'language：当前界面主语言，只能是 zh / en / unknown 之一；',
      'hasLanguageSwitch：页面上是否有中英文切换控件；switchLabels：其可见标签数组（如 中文/English）。',
      '只观察描述，不要点击。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t16-guest-language-switch-ios');
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
        throw new Error('T16 需要未登录起始状态，实际为 wallet-ready。');
      }

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      const steps: Record<string, LangState> = {};

      // 先看引导页本身是否有多语言入口。
      const guest = await inspectLanguage(agent, 'guest-landing');
      steps.guestLanding = guest;
      summary.guestHasLanguageSwitch = guest.hasLanguageSwitch;

      // 打开「服务条款」页（T15 确认该页有 中文/English 切换）。
      await tapVisibleText(agent, '服务条款', 2000);
      const terms = await inspectLanguage(agent, 'terms-zh');
      steps.termsZh = terms;

      // 场景 A：条款页有切换按钮 → 切到 English 再切回中文。
      if (terms.hasLanguageSwitch) {
        const enLabel =
          terms.switchLabels?.find((label) => /English|english|EN/i.test(label)) ?? 'English';
        await tapVisibleText(agent, enLabel, 2000);
        const en = await inspectLanguage(agent, 'terms-en');
        steps.termsEn = en;

        await captureScreen(
          agent,
          'T16 条款页 English',
          '切换到 English 后的条款页。',
          [
            `Detected language: ${en.language}`,
            `Texts: ${en.visibleTexts.slice(0, 8).join(' | ') || 'none'}`,
          ].join('\n'),
        );

        const enAssert = await assertVisible(
          agent,
          '当前条款/政策页面以英文显示（可见英文标题或英文正文，例如 "Terms of Service" / "Privacy Policy" / English 正文）。',
          '切换到 English 后页面未以英文显示。',
        );
        assertions.push({ name: 'terms-switch-to-english', ...enAssert });

        // 切回中文。
        const zhLabel =
          en.switchLabels?.find((label) => /中文|Chinese|CN/i.test(label)) ?? '中文';
        await tapVisibleText(agent, zhLabel, 2000);
        const zhBack = await inspectLanguage(agent, 'terms-zh-back');
        steps.termsZhBack = zhBack;

        const zhAssert = await assertVisible(
          agent,
          '当前条款/政策页面恢复为中文显示（可见中文标题或中文正文）。',
          '切回中文失败，页面未恢复中文。',
        );
        assertions.push({ name: 'terms-switch-back-to-zh', ...zhAssert });
      } else {
        console.log('[t16] 条款页未识别到语言切换控件，跳过英文切换场景。');
        assertions.push({
          name: 'terms-switch-to-english',
          pass: false,
          message: '条款页未找到中英文切换控件',
        });
      }

      // 安全返回（条款页返回按钮无文字标签，用 relaunch 兜底）。
      try {
        await agent.terminate(APP_ID.ios);
      } catch {
        // ignore
      }
      await sleep(800);
      await launchApp(agent, APP_ID.ios);
      await sleep(1000);

      const endState = await detectUserState(agent);
      summary.endState = endState;
      console.log(`[state] end ${endState.state} — ${endState.evidence}`);

      summary.steps = steps;
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
