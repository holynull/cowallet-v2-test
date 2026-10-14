/**
 * T05b iOS 创建钱包流程探查（email-registered-no-wallet）：
 * 点「用这个邮箱创建新钱包」进入创建流程，逐屏观察 UI 走向，
 * 一旦出现助记词/私钥/恢复口令/签名等敏感边界立即停止并记录。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：email-registered-no-wallet（「这个邮箱下没有钱包」页）
 * 风险等级：🔴 边界敏感。只观察到密钥边界前；绝不点助记词/私钥/签名相关内容。
 *
 * 运行：npm run test:ios:t05b
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type StepState = {
  phase: string;
  screenPurpose: string;
  visibleTexts: string[];
  hasSecretBoundary: boolean;
  boundaryEvidence: string[];
  safeNextLabel: string | null;
};

/** 语义判断当前步骤是否进入敏感边界（助记词/私钥/口令/签名等）。 */
async function observeStep(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<StepState> {
  return agent.aiQuery<StepState>(
    [
      `观察当前 cowallet iPhone 界面（创建钱包流程，阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasSecretBoundary：页面是否正在展示或要求用户抄写/输入助记词、私钥、恢复口令、恢复密码，或出现签名/广播确认；',
      'boundaryEvidence：若 hasSecretBoundary 为 true，列出触发判断的具体文案片段；',
      'safeNextLabel：页面上安全的继续/下一步/同意并继续按钮文案（若存在且安全）；没有则 null。',
      '只观察描述，不要点击、不要输入任何敏感内容。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t05b-create-wallet-ios');
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

      // 确认起始页：no-wallet 页。
      const landing = await agent.aiQuery<{ isNoWalletPage: boolean; screenPurpose: string }>(
        '观察当前 cowallet 界面。返回 JSON：isNoWalletPage（是否在「这个邮箱下没有钱包」页）、screenPurpose。只观察。',
      );
      if (!landing.isNoWalletPage) {
        throw new Error(`T05b 需要起始于 no-wallet 页，当前：${landing.screenPurpose}`);
      }
      await captureScreen(
        agent,
        'T05b 起始 - no wallet',
        'email-registered-no-wallet 起始页。',
        landing.screenPurpose,
      );

      // 进入创建钱包流程。
      await tapVisibleText(agent, '用这个邮箱创建新钱包', 3000);
      const steps: StepState[] = [];
      let current = await observeStep(agent, 'create-step-0');
      steps.push(current);
      await captureScreen(
        agent,
        'T05b 创建钱包 step 0',
        '创建钱包流程第一步。',
        `Boundary: ${current.hasSecretBoundary} | Texts: ${current.visibleTexts.join(' | ')}`,
      );

      // 逐步推进：只要没有敏感边界且存在安全下一步按钮，最多走 5 步。
      const MAX_STEPS = 5;
      let stepIndex = 0;
      while (!current.hasSecretBoundary && stepIndex < MAX_STEPS) {
        stepIndex += 1;
        const nextLabel = current.safeNextLabel;
        if (!nextLabel) {
          console.log(`[t05b] step ${stepIndex} 无安全下一步按钮，停止推进。`);
          break;
        }
        await tapVisibleText(agent, nextLabel, 2500);
        current = await observeStep(agent, `create-step-${stepIndex}`);
        steps.push(current);
        await captureScreen(
          agent,
          `T05b 创建钱包 step ${stepIndex}`,
          `创建钱包流程第 ${stepIndex} 步。`,
          `Boundary: ${current.hasSecretBoundary} | Texts: ${current.visibleTexts.join(' | ')}`,
        );
        if (current.hasSecretBoundary) break;
      }

      summary.steps = steps;
      summary.stoppedAtSecretBoundary = current.hasSecretBoundary;
      if (current.hasSecretBoundary) {
        summary.boundaryEvidence = current.boundaryEvidence;
        console.log(
          `[t05b] ⚠ 创建钱包流程到达敏感边界，已停止。触发：${current.boundaryEvidence.join('、')}`,
        );
        summary.status = 'stopped-at-secret-boundary';
      } else {
        summary.status = 'passed';
      }
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
