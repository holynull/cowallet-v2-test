/**
 * T24 iOS 备份验证流程（issue 2 回归，🟡 本地解密验证）。
 *
 * 覆盖：wallet-ready → 设置 → 密钥检查 → 三份钥匙 → 「现在花 30 秒测一下」→
 * 输入恢复密码（从 .env 读取，不回显）→ 「开始检查」→ 观察验证结果 → 回三份钥匙页看第三份状态。
 *
 * 说明：验证流程在本机用恢复密码解密备份，确认它属于该钱包（UI 明示密码/助记词/解开内容
 * 不会外发、不动用资金）。恢复密码仅从 git-ignored 的 .env 读取，绝不写入脚本/回显；
 * 密码输入期间不截图（避免任何可能泄露）。若流程出现导出/签名/广播/转账等执行边界则立即停止。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready（已设恢复密码，.env 有 TEST_WALLET_PASSWORD）
 * 风险等级：🟡 本地备份验证；不导出、不签名、不移动资金。
 *
 * 运行：npm run test:ios:t24
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type VerifyState = {
  screenPurpose: string;
  visibleTexts: string[];
  asksRecoveryPassword: boolean;
  inputFields: string[];
  confirmButtons: string[];
  isSecure: boolean;
  hasExecutionBoundary: boolean; // 导出/签名/广播/转账等
  boundaryLabels: string[];
  hasSecretShown: boolean; // 是否展示明文助记词/密码
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<VerifyState> {
  return agent.aiQuery<VerifyState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面用途；',
      'visibleTexts：主要可见文案数组（**不要复述任何密码/助记词/恢复码**）；',
      'asksRecoveryPassword：是否要求输入恢复密码；inputFields：输入框描述数组；confirmButtons：按钮文案数组；',
      'isSecure：是否有密码/安全输入框；',
      'hasExecutionBoundary：是否出现导出/签名/广播/转账/授权等执行边界按钮；boundaryLabels：其文案（若有）；',
      'hasSecretShown：是否展示明文助记词/密码/恢复码。',
      '只观察描述，绝对不要点执行/导出/签名/确认边界按钮。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t24-backup-verify-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  const password = process.env.TEST_WALLET_PASSWORD;
  if (!password) {
    throw new Error('缺少 TEST_WALLET_PASSWORD（.env），无法执行备份验证。');
  }

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;

    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();
      await sleep(1500);

      const startState = await agent.aiQuery<{
        state: string;
        asksRecoveryPassword: boolean;
        evidence: string;
      }>(
        '观察当前 cowallet 界面，判断用户状态。返回 JSON {state: fresh-install/email-registered-no-wallet/wallet-ready/unknown, asksRecoveryPassword: 是否正显示"测一下你的备份"恢复密码输入页, evidence}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready' && !startState.asksRecoveryPassword) {
        throw new Error(`T24 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 进入备份验证页：优先复用当前已打开的验证页，否则走 设置→密钥检查→三份钥匙。
      let verifyPage: VerifyState;
      if (startState.asksRecoveryPassword) {
        verifyPage = await inspect(agent, 'verify-entry-direct');
        summary.entryPath = 'direct-verify-entry（启动时已停留在备份验证页）';
      } else {
        await tapVisibleText(agent, '设置', 2000);
        await tapVisibleText(agent, '密钥检查', 2500);
        const threeKeys = await inspect(agent, 'three-keys');
        await captureScreen(
          agent,
          'T24 三份钥匙页',
          '三份钥匙页（验证前）。',
          `Purpose: ${threeKeys.screenPurpose}\nTexts: ${threeKeys.visibleTexts.slice(0, 8).join(' | ')}`,
        );
        await tapVisibleText(agent, '现在花 30 秒测一下', 2500);
        verifyPage = await inspect(agent, 'verify-entry');
        summary.entryPath = 'navigated-设置→密钥检查→三份钥匙→测一下';
      }
      await captureScreen(
        agent,
        'T24 验证页',
        '「测一下你的备份」验证页（输入密码前）。',
        [
          `Purpose: ${verifyPage.screenPurpose}`,
          `AsksPassword: ${verifyPage.asksRecoveryPassword}`,
          `Buttons: ${(verifyPage.confirmButtons ?? []).join('、')}`,
        ].join('\n'),
      );
      if (!verifyPage.asksRecoveryPassword) {
        throw new Error('未找到恢复密码输入页，无法继续验证。');
      }

      // 3) 输入恢复密码（先 clear 再 typeOnly，参考 t05c；输入期间不截图）。
      await agent.aiInput('the "恢复密码" secure password input field', {
        value: password,
        deepLocate: true,
        mode: 'clear',
      });
      await sleep(300);
      await agent.aiInput('the "恢复密码" secure password input field', {
        value: password,
        deepLocate: true,
        mode: 'typeOnly',
      });
      await sleep(500);

      // 4) 点「开始检查」，等待验证结果。
      await tapVisibleText(agent, '开始检查', 3000);
      const resultDeadline = Date.now() + 60000;
      let result = await inspect(agent, 'verify-result');
      while (Date.now() < resultDeadline) {
        const done = await agent.aiQuery<{ stillChecking: boolean }>(
          '观察当前界面。返回 JSON {stillChecking: 是否仍在检查中/加载中}。只观察。',
        );
        if (!done.stillChecking) break;
        await sleep(4000);
      }
      result = await inspect(agent, 'verify-result-final');
      await captureScreen(
        agent,
        'T24 验证结果',
        '备份验证后的结果界面。',
        `Purpose: ${result.screenPurpose}\nTexts: ${result.visibleTexts.join(' | ')}`,
      );
      summary.verifyResult = result;

      // 5) 回三份钥匙页，看第三份状态是否更新。
      // 验证完成后先尝试点"完成/返回"之类的确认，再回左上角。
      try {
        const closeBtn = await agent.aiQuery<{ hasClose: boolean; label: string }>(
          '验证完成后是否出现"完成/返回/关闭"等按钮？返回 JSON {hasClose, label}。只观察。',
        );
        if (closeBtn.hasClose && /完成|返回|关闭|好/.test(closeBtn.label)) {
          await tapVisibleText(agent, closeBtn.label, 1500);
        }
      } catch (error) {
        console.log(`[t24] 查找完成按钮失败（可忽略）：${errorToString(error)}`);
      }
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
        await sleep(1800);
      } catch (error) {
        console.log(`[t24] 返回失败：${errorToString(error)}`);
      }
      const afterVerify = await inspect(agent, 'three-keys-after-verify');
      await captureScreen(
        agent,
        'T24 验证后三份钥匙',
        '验证后回到三份钥匙页的状态。',
        `Purpose: ${afterVerify.screenPurpose}\nTexts: ${afterVerify.visibleTexts.slice(0, 14).join(' | ')}`,
      );
      summary.threeKeysAfterVerify = afterVerify;

      // 6) 断言。
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({
        name: 'verify-flow-reachable',
        pass: verifyPage.asksRecoveryPassword,
        message: verifyPage.screenPurpose,
      });
      const resultOk =
        result.visibleTexts.some((t) => /验证通过|已通过|检查通过|备份有效|已验证|成功/.test(t)) ||
        afterVerify.visibleTexts.some((t) => /已验证|已通过|OK|正常|有效/.test(t));
      assertions.push({
        name: 'backup-verify-passed',
        pass: resultOk,
        message: `验证结果: ${result.visibleTexts.slice(-6).join(' | ')}`,
      });
      assertions.push({
        name: 'no-execution-boundary',
        pass: !verifyPage.hasExecutionBoundary && !result.hasExecutionBoundary,
        message: (result.boundaryLabels ?? []).join('、') || '无执行边界',
      });
      assertions.push({
        name: 'no-secret-shown',
        pass: !verifyPage.hasSecretShown && !result.hasSecretShown,
        message: '无明文助记词/密码暴露',
      });

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
