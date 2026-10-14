/**
 * T01 Android 冒烟：确认设备、App 安装情况与首屏可读性。
 *
 * 平台：Android 真机
 * App：ANDROID_BUNDLE_ID（默认 com.cowallet.app）
 * 前置：设备已连接并授权；App 已安装（脚本不会自动安装）
 * 风险等级：只读。不进入转账、签名、授权、导出密钥等入口。
 *
 * 运行：npm run test:android:smoke
 */

import 'dotenv/config';

import { APP_ID, assertAppUiRendered, createAndroidAgent, createRunContext, detectUserState, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, launchApp, sleep } from './lib/device-kit.ts';

async function main(): Promise<number> {
  const ctx = await createRunContext('t01-smoke-android');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'android',
    bundleId: APP_ID.android,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createAndroidAgent(ctx);
    summary.deviceId = deviceId;

    try {
      const packagePath = await agent.runAdbShell(`pm path ${APP_ID.android}`);
      if (!packagePath.includes('package:')) {
        throw new Error(
          `设备 ${deviceId} 上没有安装 ${APP_ID.android}。安装 APK 属于设备变更，请确认包来源后再安装。`,
        );
      }

      const [model, release, sdk, wmSize, wmDensity, dump] = await Promise.all([
        agent.runAdbShell('getprop ro.product.model'),
        agent.runAdbShell('getprop ro.build.version.release'),
        agent.runAdbShell('getprop ro.build.version.sdk'),
        agent.runAdbShell('wm size'),
        agent.runAdbShell('wm density'),
        agent.runAdbShell(`dumpsys package ${APP_ID.android}`),
      ]);

      const versionName = dump.match(/versionName=(\S+)/)?.[1] ?? 'unknown';
      summary.deviceInfo = {
        model: model.trim(),
        androidVersion: release.trim(),
        sdk: sdk.trim(),
        wmSize: wmSize.trim(),
        wmDensity: wmDensity.trim(),
      };
      summary.appVersion = versionName;

      await launchApp(agent, APP_ID.android);
      await captureScreen(
        agent,
        'cowallet Android 首屏',
        '启动 cowallet 后的安卓首屏。',
        [
          `Package: ${APP_ID.android}`,
          `versionName: ${versionName}`,
          `Device: ${model.trim()} / Android ${release.trim()} (SDK ${sdk.trim()})`,
          `wm size: ${wmSize.trim()} / wm density: ${wmDensity.trim()}`,
          '只读冒烟：不提交任何钱包、转账、兑换或签名动作。',
        ].join('\n'),
      );

      const visible = await agent.aiQuery<{
        screenPurpose: string;
        visibleTexts: string[];
        hasChatOrAiEntry: boolean;
        hasWalletContext: boolean;
      }>(
        '返回当前 cowallet 安卓界面的 JSON 描述：screenPurpose（一句话说明这是哪个页面）、visibleTexts（主要可见文案数组）、hasChatOrAiEntry（是否有 AI 对话入口）、hasWalletContext（是否能看到资产/钱包上下文）。',
      );
      summary.visible = visible;

      const assertion = await assertAppUiRendered(agent, 'android');
      summary.assertion = assertion;
      summary.status = assertion.pass ? 'passed' : 'failed';

      const state = await detectUserState(agent);
      summary.userState = state;
      console.log(`[state] ${state.state} — ${state.evidence}`);

      summary.midsceneReport = agent.reportFile ?? null;
      await sleep(300);
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
