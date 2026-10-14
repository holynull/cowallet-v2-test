/**
 * T05 iOS email-registered-no-wallet 三入口探查：
 * 覆盖「这个邮箱下没有钱包」页的三个选项——
 *   1) 获取帮助（只读）
 *   2) 换一个邮箱登录（停在新的邮箱输入页前，不输入新邮箱）
 *   3) 用这个邮箱创建新钱包（进入创建流程，一旦出现助记词/私钥/签名/密钥展示
 *      立即停止并按边界规则记录，不展示密钥）
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：email-registered-no-wallet（已完成邮箱+OTP 验证）
 * 风险等级：🟡 只读探索；任何密钥/签名边界立即停止。
 *
 * 运行：npm run test:ios:t05
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type ChoiceState = {
  phase: string;
  screenPurpose: string;
  visibleTexts: string[];
  hasSecretBoundary: boolean;
  boundaryEvidence: string[];
  hasSafeBack: boolean;
  safeBackLabel: string | null;
};

const SECRET_KEYWORDS = ['助记词', '私钥', '密钥', '恢复短语', 'seed', 'mnemonic', 'backup', '签名', '口令'];

async function inspectChoice(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ChoiceState> {
  return agent.aiQuery<ChoiceState>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasSecretBoundary：页面是否正在展示或要求输入助记词、私钥、恢复口令、签名确认等敏感内容；',
      'boundaryEvidence：若有，列出具体触发敏感判断的文案片段；',
      'hasSafeBack：是否有安全的返回/取消按钮；safeBackLabel：其精确文案（无则 null）。',
      '只观察描述，不要点击、不要输入任何敏感内容。',
    ].join('\n'),
  );
}

/**
 * 返回上一步。注意：登录态不跨进程持久化，绝不能 terminate + relaunch
 * （会回到未登录引导页）。返回只依赖页面内返回按钮：
 * 1) 优先点 AI 识别出的文字返回按钮；
 * 2) 否则点 iOS 左上角标准返回位置（返回箭头通常在 (0.08w, 0.09h) 附近）。
 */
async function safeReturn(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
  state: ChoiceState,
): Promise<void> {
  if (state.hasSafeBack && state.safeBackLabel && state.safeBackLabel !== 'TestFlight') {
    await tapVisibleText(agent, state.safeBackLabel, 1500);
    return;
  }
  try {
    const size = await agent.page.size();
    await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
    await sleep(1500);
    console.log(`[t05] ${phase} 无文字返回按钮，点左上角标准返回位置。`);
  } catch (error) {
    console.log(`[t05] ${phase} 左上角返回失败：${errorToString(error)}`);
  }
}

/** 判断当前是否在「这个邮箱下没有钱包」页。 */
async function isNoWalletPage(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<boolean> {
  const info = await agent.aiQuery<{ isNoWalletPage: boolean; screenPurpose: string }>(
    '观察当前 cowallet 界面。返回 JSON：isNoWalletPage（是否在「这个邮箱下没有钱包」页）、screenPurpose（一句话说明页面用途）。只观察。',
  );
  return Boolean(info.isNoWalletPage);
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t05-no-wallet-choices-probe-ios');
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

      // 不 relaunch：直接连上当前「这个邮箱下没有钱包」页。
      const landing = await inspectChoice(agent, 'no-wallet-landing');
      summary.landing = landing;
      await captureScreen(
        agent,
        'T05 起始 - 邮箱下没有钱包',
        'email-registered-no-wallet 状态页。',
        `Texts: ${landing.visibleTexts.join(' | ')}`,
      );
      if (!(await isNoWalletPage(agent))) {
        throw new Error('T05 需要起始于「这个邮箱下没有钱包」页，当前不在此页。请先完成邮箱+OTP 登录。');
      }

      const entries: Record<string, { entry: string; state: ChoiceState | null }> = {
        help: { entry: '获取帮助', state: null },
        changeEmail: { entry: '换一个邮箱登录', state: null },
        createWallet: { entry: '用这个邮箱创建新钱包', state: null },
      };

      // 1) 获取帮助（只读）。
      await tapVisibleText(agent, '获取帮助', 2000);
      entries.help.state = await inspectChoice(agent, 'help-page');
      await captureScreen(
        agent,
        'T05 获取帮助',
        '点「获取帮助」后的页面。',
        `Texts: ${entries.help.state.visibleTexts.join(' | ')}`,
      );
      await safeReturn(agent, 'help-page', entries.help.state);
      if (!(await isNoWalletPage(agent))) {
        throw new Error('「获取帮助」返回后未回到「这个邮箱下没有钱包」页，流程失联。');
      }

      // 2) 换一个邮箱登录（停在新的邮箱输入页，不输入）。
      await tapVisibleText(agent, '换一个邮箱登录', 2000);
      entries.changeEmail.state = await inspectChoice(agent, 'change-email');
      await captureScreen(
        agent,
        'T05 换邮箱登录',
        '点「换一个邮箱登录」后的页面。',
        `Texts: ${entries.changeEmail.state.visibleTexts.join(' | ')}`,
      );
      if (entries.changeEmail.state.hasSecretBoundary) {
        throw new Error(`换邮箱流程意外进入敏感边界：${entries.changeEmail.state.boundaryEvidence.join('、')}`);
      }
      await safeReturn(agent, 'change-email', entries.changeEmail.state);
      if (!(await isNoWalletPage(agent))) {
        throw new Error('「换一个邮箱登录」返回后未回到「这个邮箱下没有钱包」页，流程失联。');
      }

      // 3) 用这个邮箱创建新钱包：进入创建流程，检测到密钥边界立即停止。
      await tapVisibleText(agent, '用这个邮箱创建新钱包', 2500);
      const create = await inspectChoice(agent, 'create-wallet');
      entries.createWallet.state = create;
      await captureScreen(
        agent,
        'T05 创建钱包流程',
        '点「用这个邮箱创建新钱包」后进入的创建流程第一步。',
        `Texts: ${create.visibleTexts.join(' | ')}`,
      );

      // 边界检查：进入创建钱包流程后，逐步观察；一旦 hasSecretBoundary 立即停止。
      let current = create;
      let stepIndex = 0;
      while (!current.hasSecretBoundary && stepIndex < 3) {
        stepIndex += 1;
        const next = await inspectChoice(agent, `create-wallet-step-${stepIndex}`);
        await captureScreen(
          agent,
          `T05 创建钱包流程 step ${stepIndex}`,
          `创建钱包流程第 ${stepIndex} 步。`,
          `Texts: ${next.visibleTexts.join(' | ')} | Boundary: ${next.hasSecretBoundary}`,
        );
        current = next;
        if (current.hasSecretBoundary) break;
        if (current.visibleTexts.some((t) => /备份|恢复|选择|继续|下一步/.test(t))) {
          // 尝试点安全推进按钮（若有），但绝不点敏感内容。
          const nextLabel = current.visibleTexts.find((t) => /^继续$|^下一步$|^开始$/.test(t));
          if (nextLabel) {
            await tapVisibleText(agent, nextLabel, 2000);
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (current.hasSecretBoundary) {
        summary.stoppedAtSecretBoundary = true;
        summary.boundaryEvidence = current.boundaryEvidence;
        console.log(
          `[t05] ⚠ 创建钱包流程到达敏感边界，已停止。触发词：${current.boundaryEvidence.join('、')}`,
        );
        summary.status = 'stopped-at-secret-boundary';
      } else {
        summary.stoppedAtSecretBoundary = false;
        summary.status = 'passed';
      }

      summary.entries = entries;
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
