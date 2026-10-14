/**
 * T20 iOS 后台切换后 AI 会话与结果持久性（只读）。
 *
 * 覆盖：wallet-ready 状态下进入 AI 对话页发送一条只读查询 → 按 Home 键将 App 退到后台 →
 * 重新拉回前台 → 验证：不被打回登录页、AI 会话与结果卡仍在、底部导航可用、余额仍可查询。
 *
 * 说明：这里用「Home 键退后台 + launch 拉前台」的进程常驻方式（不是 terminate+relaunch）。
 * 若重启进程后回未登录页属另一类问题（此前观察到登录态不跨进程持久化），不在本用例覆盖范围。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟢 只读。仅发送只读查询与退后台/回前台，不点任何确认/签名/发送边界。
 *
 * 运行：npm run test:ios:t20
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type UiState = {
  screenPurpose: string;
  visibleTexts: string[];
  isLoginPage: boolean;
  isWalletPage: boolean;
  hasChatHistory: boolean;
  hasResultCard: boolean;
  hasBottomNav: boolean;
  navLabels: string[];
  hasSecretContent: boolean;
  secretEvidence: string[];
  hasInput: boolean;
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<UiState> {
  return agent.aiQuery<UiState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面用途；',
      'visibleTexts：主要可见文案数组（会话/余额/结果可引用，但不要复述助记词/私钥/恢复码等敏感值）；',
      'isLoginPage：当前是否是需要重新登录/注册的页面（邮箱登录、欢迎引导、验证码等）；',
      'isWalletPage：当前是否处于钱包已就绪状态（能看到首页/钱包/资产等）；',
      'hasChatHistory：AI 对话页是否还有历史对话消息（包括本会话刚发的查询与 AI 回复）；',
      'hasResultCard：是否有 AI 结果卡/余额卡片/转账执行进度等结果内容；',
      'hasBottomNav：是否有底部导航（首页/钱包/AI助手/设置）；navLabels：底部导航文案数组；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容；secretEvidence：若有，仅列类别；',
      'hasInput：是否有可输入的文本输入框。',
      '只观察描述，绝不点击任何确认/签名/发送按钮。',
    ].join('\n'),
  );
}

/** 处理「AI 助手数据使用说明」弹窗（数据隐私同意，非资金边界），只点「同意并继续」。 */
async function handleConsentDialog(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<void> {
  const probe = await agent.aiQuery<{ hasConsent: boolean; buttons: string[] }>(
    [
      '观察当前 cowallet 界面。返回 JSON：',
      'hasConsent：是否被「AI 助手数据使用说明」数据授权弹窗遮挡；',
      'buttons：弹窗上所有按钮文案数组。',
      '只观察，不要点击。',
    ].join('\n'),
  );
  if (!probe.hasConsent) return;
  await captureScreen(agent, `T20 ${phase} AI 助手数据授权弹窗`, 'AI 助手数据使用说明弹窗。', `Buttons: ${(probe.buttons ?? []).join(' | ')}`);
  if ((probe.buttons ?? []).some((b) => b.includes('同意'))) {
    await tapVisibleText(agent, '同意并继续', 3000);
  }
}

/** 发送一条只读查询并等待 AI 回复。 */
async function sendReadOnlyQuery(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  prompt: string,
): Promise<void> {
  await agent.aiTap('the AI chat message input field (bottom input bar, placeholder 输入问题...)', { deepLocate: true });
  await sleep(800);
  try {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'replace' });
  } catch {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'typeOnly' });
  }
  await sleep(500);
  await agent.aiTap('the send button in the chat input bar (send arrow / 发送)', { deepLocate: true });
  await sleep(6000);
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t20-bg-foreground-chat-persistence-ios');
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
      await sleep(1500);

      // 起点自复位：确保落在首页 tab，并判定 wallet-ready。
      await handleConsentDialog(agent, 'start-pre');
      try {
        await tapVisibleText(agent, '首页', 1500);
      } catch {
        try {
          const size = await agent.page.size();
          await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
          await sleep(1500);
          await tapVisibleText(agent, '首页', 1500);
        } catch (error) {
          console.log(`[t20] 自复位失败：${errorToString(error)}`);
        }
      }
      const startState = await agent.aiQuery<{ state: string; evidence: string }>(
        '观察当前 cowallet 界面。返回 JSON {state: 只能是 fresh-install/email-registered-no-wallet/wallet-ready/unknown 之一, evidence: 判断依据}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T20 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 进入 AI 对话页并发送一条只读查询。
      try {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
      } catch {
        await tapVisibleText(agent, 'AI助手', 2000);
      }
      await sleep(2500);
      await handleConsentDialog(agent, 'pre-query');
      await sendReadOnlyQuery(agent, '我的总资产是多少？');
      const chatBefore = await inspect(agent, 'before-background');
      await captureScreen(
        agent,
        'T20 退后台前会话',
        '发送只读查询后、退后台前的 AI 对话页（会话与结果卡应可见）。',
        `Screen: ${chatBefore.screenPurpose}\nTexts: ${chatBefore.visibleTexts.join(' | ')}\nHasResultCard: ${chatBefore.hasResultCard}`,
      );
      summary.beforeBackground = chatBefore;

      // 2) 按 Home 退后台（进程常驻），等待后拉回前台。
      console.log('[t20] 按 Home 键退到后台…');
      try {
        await agent.home();
      } catch (error) {
        console.log(`[t20] agent.home() 失败：${errorToString(error)}`);
      }
      await sleep(3000);
      console.log('[t20] 拉回前台…');
      try {
        await agent.launch(APP_ID.ios);
      } catch (error) {
        console.log(`[t20] agent.launch() 失败：${errorToString(error)}`);
      }
      await sleep(4000);

      // 3) 退后台后观察：是否回登录页 / 会话是否还在 / 是否出现锁屏或自动锁定。
      await handleConsentDialog(agent, 'after-foreground');
      const chatAfter = await inspect(agent, 'after-foreground');
      await captureScreen(
        agent,
        'T20 回前台后会话',
        '退后台后重新回前台的界面。',
        `Screen: ${chatAfter.screenPurpose}\nTexts: ${chatAfter.visibleTexts.join(' | ')}\nIsLoginPage: ${chatAfter.isLoginPage}\nHasChatHistory: ${chatAfter.hasChatHistory}\nHasResultCard: ${chatAfter.hasResultCard}`,
      );
      summary.afterForeground = chatAfter;

      // 4) 底部导航仍可用：切到首页再切回钱包，确认未回登录态。
      let navUsable = false;
      let homeAfter: UiState | undefined;
      try {
        await tapVisibleText(agent, '首页', 2000);
        homeAfter = await inspect(agent, 'home-after-foreground');
        navUsable = homeAfter.isWalletPage && !homeAfter.isLoginPage;
        await captureScreen(
          agent,
          'T20 回前台后首页',
          '退后台回来后切到首页 tab 的界面（应仍为 wallet-ready）。',
          `Screen: ${homeAfter.screenPurpose}\nTexts: ${homeAfter.visibleTexts.join(' | ')}\nIsLoginPage: ${homeAfter.isLoginPage}`,
        );
      } catch (error) {
        console.log(`[t20] 切首页失败：${errorToString(error)}`);
      }
      summary.homeAfterForeground = homeAfter;

      // 5) 断言。
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      const loginLost = chatAfter.isLoginPage;
      const chatKept = chatAfter.hasChatHistory || chatAfter.hasResultCard || chatAfter.visibleTexts.some((t) => /我的总资产|ETH|总资产/.test(t));
      assertions.push({ name: 'no-login-after-background', pass: !loginLost, message: loginLost ? '退后台回来后被打回登录页' : chatAfter.screenPurpose });
      assertions.push({ name: 'chat-conversation-persisted', pass: chatKept, message: chatKept ? '会话/结果仍在' : '会话或结果卡丢失' });
      assertions.push({ name: 'no-secret-exposed', pass: !chatAfter.hasSecretContent, message: (chatAfter.secretEvidence ?? []).join('、') || 'no secret' });
      if (navUsable !== undefined) {
        assertions.push({ name: 'bottom-nav-usable-after-bg', pass: navUsable, message: navUsable ? '底部导航可用且未回登录态' : '底部导航后回到非 wallet 状态' });
      }

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
