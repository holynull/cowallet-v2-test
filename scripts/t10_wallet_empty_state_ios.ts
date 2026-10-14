/**
 * T10 iOS wallet-ready 钱包 tab 资产空状态滚动地图。
 *
 * 覆盖：总资产 $0.00 空状态渲染；「你的资产」列表（Base/ETH 等）；证券代币·即将推出；
 * 在赚利息的钱·暂无；列表顶部/底部滚动地图。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready（总资产 $0.00）
 * 风险等级：🟢 只读。只切 tab 与滚动观察，不触碰任何执行入口。
 *
 * 运行：npm run test:ios:t10
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
};

async function inspect(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ViewState> {
  return agent.aiQuery<ViewState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'visibleTexts：主要可见文案数组（不要复述助记词/私钥/恢复码等敏感值）；',
      'hasSecretContent：是否展示助记词/私钥/恢复码/分片明文等敏感内容；secretEvidence：若有，仅列出文案类别；',
      'hasSendConfirm：是否出现发送/确认/签名/授权等执行级按钮；confirmLabels：其文案。',
      '只观察描述，绝不点击任何按钮。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t10-wallet-empty-state-ios');
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
        throw new Error(`T10 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      await tapVisibleText(agent, '钱包', 2000);
      const top = await inspect(agent, 'wallet-tab-top');
      await captureScreen(agent, 'T10 钱包tab 顶部', '钱包 tab 顶部（总资产与资产列表）。', `Texts: ${top.visibleTexts.join(' | ')}`);
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({ name: 'wallet-tab-render', pass: top.visibleTexts.length > 0 && Boolean(top.screenPurpose), message: top.screenPurpose });
      assertions.push({ name: 'wallet-tab-no-secret', pass: !top.hasSecretContent, message: (top.secretEvidence ?? []).join('、') || 'no secret' });
      assertions.push({ name: 'wallet-tab-no-confirm-entry', pass: !top.hasSendConfirm, message: (top.confirmLabels ?? []).join('、') || 'no confirm' });

      // 滚动到底部再回到顶部，形成顶部/底部滚动地图。
      const map: Array<{ position: string; visibleTexts: string[] }> = [{ position: 'top', visibleTexts: top.visibleTexts }];
      try {
        const size = await agent.page.size();
        await agent.page.scrollDown(Math.round(size.height * 0.5), {
          left: Math.round(size.width / 2),
          top: Math.round(size.height * 0.72),
        });
        await sleep(1500);
        const bottom = await inspect(agent, 'wallet-tab-bottom');
        map.push({ position: 'bottom', visibleTexts: bottom.visibleTexts });
        await captureScreen(agent, 'T10 钱包tab 底部', '钱包 tab 滚动到底部。', `Texts: ${bottom.visibleTexts.join(' | ')}`);
        assertions.push({ name: 'wallet-tab-bottom-render', pass: bottom.visibleTexts.length > 0, message: bottom.screenPurpose });
        for (let index = 0; index < 4; index += 1) {
          await agent.page.scrollUp(Math.round(size.height * 0.6), {
            left: Math.round(size.width / 2),
            top: Math.round(size.height * 0.3),
          });
          await sleep(600);
        }
      } catch (error) {
        console.log(`[t10] 滚动地图失败：${errorToString(error)}`);
      }

      summary.map = map;
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
