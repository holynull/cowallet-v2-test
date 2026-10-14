/**
 * T05c iOS 创建钱包 - 设置恢复密码 → 保存备份，推进到助记词边界前停止。
 *
 * 前置：已通过 Face ID 验证，停在「设置恢复密码」页。
 * 边界：助记词展示/备份文件导出/私钥为硬边界，到达即停，绝不截屏/记录助记词内容。
 * 恢复密码从 .env TEST_WALLET_PASSWORD 读取，明文不落报告。
 *
 * 运行：npm run test:ios:t05c
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, requireEnv, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText, typeVisibleText } from './lib/device-kit.ts';

type PageState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasRecoveryPasswordInput: boolean;
  hasConfirmPasswordInput: boolean;
  hasSecurityQuestion: boolean;
  hasSecretMnemonicDisplay: boolean;
  boundaryEvidence: string[];
  safeNextLabel: string | null;
};

/** 输入文本后收起软键盘：优先点 Done/Return/Go，失败则点输入框外区域收起。 */
async function dismissKeyboard(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<void> {
  try {
    await agent.aiTap('the keyboard Done, Return, Go, or dismiss-keyboard control', {
      deepLocate: true,
    });
    await sleep(800);
    return;
  } catch {
    // fallback
  }
  try {
    const size = await agent.page.size();
    await agent.page.tap(Math.round(size.width / 2), Math.round(size.height * 0.35));
    await sleep(800);
  } catch (error) {
    console.log(`[t05c] 收起键盘失败：${errorToString(error)}`);
  }
}

async function observePage(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<PageState> {
  return agent.aiQuery<PageState>(
    [
      `观察当前 cowallet iPhone 界面（创建钱包流程，阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'visibleTexts：主要可见文案数组（**若页面展示 24 个助记词单词，只写 "24-word-mnemonic-shown"，不要把单词内容放进来**）；',
      'hasRecoveryPasswordInput：是否有恢复密码输入框；hasConfirmPasswordInput：是否有确认/再输一次输入框；',
      'hasSecurityQuestion：是否有安全问题/提示问题输入；',
      'hasSecretMnemonicDisplay：页面是否正在展示 24 个助记词或备份文件/私钥内容；',
      'boundaryEvidence：若是，列出触发判断的文案（不含具体单词）；',
      'safeNextLabel：安全的继续/下一步/保存按钮文案（若存在且安全）；没有则 null。',
      '只观察描述，不要点击。若看到助记词，不要读取或记录具体单词。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t05c-set-recovery-password-ios');
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
    const password = requireEnv('TEST_WALLET_PASSWORD');

    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();

      // 确认当前在「设置恢复密码」页。
      const start = await observePage(agent, 'recovery-password-page');
      summary.startPage = {
        screenPurpose: start.screenPurpose,
        hasRecoveryPasswordInput: start.hasRecoveryPasswordInput,
        hasConfirmPasswordInput: start.hasConfirmPasswordInput,
        hasSecurityQuestion: start.hasSecurityQuestion,
      };
      if (start.hasSecretMnemonicDisplay) {
        throw new Error('起点页面已展示助记词，立即停止。');
      }
      if (!start.hasRecoveryPasswordInput) {
        throw new Error(`当前不在恢复密码页，无法继续。页面：${start.screenPurpose}`);
      }

      // 输入恢复密码 + 确认。密码框是 secure field，aiInput 的整串 replace
      // 不可靠（实测会把两个框搞混），改用「先 clear 再 typeOnly」逐框输入。
      await agent.aiInput('the "恢复密码" password input field', {
        value: password,
        deepLocate: true,
        mode: 'clear',
      });
      await sleep(500);
      await agent.aiInput('the "恢复密码" password input field', {
        value: password,
        deepLocate: true,
        mode: 'typeOnly',
      });
      await sleep(500);
      await dismissKeyboard(agent);
      if (start.hasConfirmPasswordInput) {
        await agent.aiInput('the "再输一次" confirm password input field', {
          value: password,
          deepLocate: true,
          mode: 'clear',
        });
        await sleep(500);
        await agent.aiInput('the "再输一次" confirm password input field', {
          value: password,
          deepLocate: true,
          mode: 'typeOnly',
        });
        await sleep(500);
        await dismissKeyboard(agent);
      }
      await captureScreen(
        agent,
        'T05c 已填恢复密码',
        '已输入恢复密码（两次）后的页面。不含密码明文。',
        `Page: ${start.screenPurpose} | 密码已填（长度 ${password.length}）`,
      );

      // 若有安全问题，记录但暂不填写（避免额外不确定输入）。
      if (start.hasSecurityQuestion) {
        summary.securityQuestionPresent = true;
        console.log('[t05c] 页面含安全问题输入框（本次不填写，跳过）。');
      }

      // 点「保存备份」。
      const saveLabel = start.safeNextLabel && /保存|备份|继续|下一步/.test(start.safeNextLabel)
        ? start.safeNextLabel
        : '保存备份';
      await tapVisibleText(agent, saveLabel, 3000);

      // 逐步推进，最多 5 步，遇到助记词/私钥展示立即停止。
      const steps: Array<{ phase: string; screenPurpose: string; hasSecretMnemonicDisplay: boolean; boundaryEvidence: string[] }> = [];
      let current = await observePage(agent, 'after-save-backup');
      steps.push({
        phase: 'after-save-backup',
        screenPurpose: current.screenPurpose,
        hasSecretMnemonicDisplay: current.hasSecretMnemonicDisplay,
        boundaryEvidence: current.boundaryEvidence,
      });
      await captureScreen(
        agent,
        'T05c 保存备份后',
        '点保存备份后的页面。',
        `Page: ${current.screenPurpose} | MnemonicShown: ${current.hasSecretMnemonicDisplay}`,
      );

      let stepIndex = 0;
      while (!current.hasSecretMnemonicDisplay && stepIndex < 5) {
        stepIndex += 1;
        const nextLabel = current.safeNextLabel;
        if (!nextLabel || !/继续|下一步|开始|完成|核对|我记好了|备份完成/.test(nextLabel)) {
          console.log(`[t05c] step ${stepIndex} 无安全下一步按钮，停止推进。`);
          break;
        }
        await tapVisibleText(agent, nextLabel, 2500);
        current = await observePage(agent, `step-${stepIndex}`);
        steps.push({
          phase: `step-${stepIndex}`,
          screenPurpose: current.screenPurpose,
          hasSecretMnemonicDisplay: current.hasSecretMnemonicDisplay,
          boundaryEvidence: current.boundaryEvidence,
        });
        await captureScreen(
          agent,
          `T05c step ${stepIndex}`,
          `创建钱包流程推进第 ${stepIndex} 步。`,
          `Page: ${current.screenPurpose} | MnemonicShown: ${current.hasSecretMnemonicDisplay}`,
        );
        if (current.hasSecretMnemonicDisplay) break;
      }

      summary.steps = steps;
      summary.stoppedAtMnemonicBoundary = current.hasSecretMnemonicDisplay;
      if (current.hasSecretMnemonicDisplay) {
        summary.boundaryEvidence = current.boundaryEvidence;
        console.log(
          `[t05c] ⚠ 到达助记词/密钥展示边界，已停止。证据：${current.boundaryEvidence.join('、')}`,
        );
        summary.status = 'stopped-at-mnemonic-boundary';
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
