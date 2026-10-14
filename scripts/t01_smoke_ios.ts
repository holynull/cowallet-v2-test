/**
 * T01 iOS 冒烟：确认设备、WDA 会话与首屏可读性。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（默认 com.cowallet.app）
 * 前置：设备已连接并在 devicectl 中为 available；App 已安装（脚本不会自动安装）
 *       WDA 已就绪或允许自动启动（WDA_AUTOSTART）
 * 风险等级：只读。不进入转账、签名、授权、导出密钥等入口。
 *
 * 运行：npm run test:ios:smoke
 */

import 'dotenv/config';

import { APP_ID, assertAppUiRendered, createIosAgent, createRunContext, detectUserState, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, launchApp } from './lib/device-kit.ts';

async function main(): Promise<number> {
  const ctx = await createRunContext('t01-smoke-ios');
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
      await captureScreen(
        agent,
        'cowallet iOS 首屏',
        '启动 cowallet 后的 iPhone 首屏。',
        [
          `Bundle id: ${APP_ID.ios}`,
          `Device: ${JSON.stringify(summary.deviceInfo)}`,
          `Screen: ${JSON.stringify(summary.screenSize)}`,
          '只读冒烟：不提交任何钱包、转账、兑换或签名动作。',
        ].join('\n'),
      );

      const visible = await agent.aiQuery<{
        screenPurpose: string;
        visibleTexts: string[];
        hasChatOrAiEntry: boolean;
        hasWalletContext: boolean;
      }>(
        '返回当前 cowallet iPhone 界面的 JSON 描述：screenPurpose（一句话说明这是哪个页面）、visibleTexts（主要可见文案数组）、hasChatOrAiEntry（是否有 AI 对话入口）、hasWalletContext（是否能看到资产/钱包上下文）。',
      );
      summary.visible = visible;

      const assertion = await assertAppUiRendered(agent, 'ios');
      summary.assertion = assertion;
      summary.status = assertion.pass ? 'passed' : 'failed';

      const state = await detectUserState(agent);
      summary.userState = state;
      console.log(`[state] ${state.state} — ${state.evidence}`);

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
