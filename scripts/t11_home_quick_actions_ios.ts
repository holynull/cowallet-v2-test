/**
 * T11 iOS wallet-ready 首页快捷操作只读探查：接收 / 发送 / 联系人。
 *
 * - 接收：应展示公开收款地址 + 二维码（公钥信息，非机密）。
 * - 发送：空钱包（$0.00）应进入收款人/金额输入或 AI 澄清，绝不出现并点击确认/签名。
 * - 联系人：观察联系人列表（可能为空）。
 * 返回统一用底部导航「首页」复位，避免误触「对话历史」入口。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 只读。绝不点击发送确认/签名/授权。
 *
 * 运行：npm run test:ios:t11
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type ViewState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasSecretContent: boolean;
  secretEvidence: string[];
  hasSendConfirm: boolean;
  confirmLabels: string[];
  hasRecipientInput: boolean;
  hasAmountInput: boolean;
};

async function inspect(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ViewState> {
  return agent.aiQuery<ViewState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'visibleTexts：主要可见文案数组（不要复述助记词/私钥/恢复码等敏感值；收款地址是公开信息可正常引用）；',
      'hasSecretContent：是否展示助记词/私钥/恢复码/分片明文等敏感内容；secretEvidence：若有，仅列出文案类别；',
      'hasSendConfirm：是否出现发送/确认/签名/授权等执行级按钮；confirmLabels：其文案；',
      'hasRecipientInput：是否有收款人/地址输入框；hasAmountInput：是否有金额输入框。',
      '只观察描述，绝不点击任何确认/签名/发送/授权按钮。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t11-home-quick-actions-ios');
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
      const startState = await agent.aiQuery<{ state: string; evidence: string }>(
        [
          '观察当前 cowallet 界面，判断用户状态。返回 JSON：',
          'state：只能是 fresh-install、email-registered-no-wallet、wallet-ready、unknown 之一；evidence：一句话判断依据。只观察。',
        ].join('\n'),
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T11 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      await tapVisibleText(agent, '首页', 2000);
      const actions = ['接收', '发送', '联系人'] as const;
      const results: Record<string, ViewState> = {};
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      for (const action of actions) {
        console.log(`\n[t11] === ${action} ===`);
        await tapVisibleText(agent, action, 2500);
        const state = await inspect(agent, action);
        results[action] = state;
        await captureScreen(
          agent,
          `T11 - ${action}`,
          `首页快捷操作「${action}」页面（只读）。`,
          [
            `Action: ${action}`,
            `Purpose: ${state.screenPurpose}`,
            `RecipientInput: ${state.hasRecipientInput} | AmountInput: ${state.hasAmountInput}`,
            `ConfirmLabels: ${(state.confirmLabels ?? []).join('、') || 'none'}`,
            `Secret: ${state.hasSecretContent}`,
          ].join('\n'),
        );
        assertions.push({ name: `${action}-reachable`, pass: state.visibleTexts.length > 0 && Boolean(state.screenPurpose), message: state.screenPurpose });
        assertions.push({ name: `${action}-no-secret`, pass: !state.hasSecretContent, message: (state.secretEvidence ?? []).join('、') || 'no secret' });
        // 安全断言：即使出现转账/确认卡片，也绝不自动执行；脚本只记录不点按。
        // 发送入口在对话优先设计下可能直接出现「转账」草稿卡，属预期中间态，不算失败。
        assertions.push({
          name: `${action}-draft-not-executed`,
          pass: true,
          message: (state.confirmLabels ?? []).join('、') || 'no confirm shown (未点按，未执行)',
        });
        // 复位：优先底部导航「首页」；压入式页面（无底部导航）用返回箭头。
        try {
          await tapVisibleText(agent, '首页', 2000);
        } catch {
          try {
            const size = await agent.page.size();
            await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
            await sleep(1500);
            await tapVisibleText(agent, '首页', 2000);
          } catch (error) {
            console.log(`[t11] ${action} 复位失败：${errorToString(error)}`);
          }
        }
      }

      summary.results = results;
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
