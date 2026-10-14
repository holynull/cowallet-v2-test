/**
 * T23 iOS 扫码（二维码）流程（🟡 只读 + 系统权限交互）。
 *
 * 覆盖：wallet-ready → 首页点「扫码」→ 记录系统相机权限弹窗（用户手动允许）→
 * 验证扫码相机界面打开 → 安全退出（不扫描、不解析、不执行任何动作）。
 *
 * 说明：相机权限需用户在设备上手动点「允许」。脚本只负责：点扫码、观察权限弹窗与扫码
 * 界面、安全返回。绝不拿扫码结果做任何转账/授权/签名动作。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 仅权限交互 + 扫码界面观察；不扫描任何二维码、不执行任何指令。
 *
 * 运行：npm run test:ios:t23
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type ScanState = {
  screenPurpose: string;
  isPermissionDialog: boolean;
  permissionTitle: string | null;
  permissionButtons: string[];
  isScanner: boolean; // 是否已打开扫码相机界面
  hasScanFrame: boolean;
  visibleTexts: string[];
  hasSecretContent: boolean;
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<ScanState> {
  return agent.aiQuery<ScanState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面/弹窗用途；',
      'isPermissionDialog：是否出现系统相机权限弹窗；permissionTitle：弹窗标题（无则 null）；permissionButtons：弹窗按钮数组；',
      'isScanner：是否已打开扫码/相机界面（能看到取景画面、扫描框等）；hasScanFrame：是否有扫描框/取景提示；',
      'visibleTexts：主要可见文案数组；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容。',
      '只观察描述，绝对不要点弹窗按钮、不要扫描二维码、不要拿扫码结果做任何动作。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t23-qr-scan-ios');
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
        '观察当前 cowallet 界面，判断用户状态。返回 JSON {state: fresh-install/email-registered-no-wallet/wallet-ready/unknown, evidence}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T23 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 回到首页（若在压入式页面则先返回）。
      try {
        await tapVisibleText(agent, '首页', 1500);
      } catch {
        try {
          const size = await agent.page.size();
          await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
          await sleep(1500);
          await tapVisibleText(agent, '首页', 1500);
        } catch (error) {
          console.log(`[t23] 回首页失败：${errorToString(error)}`);
        }
      }

      // 2) 点「扫码」。
      await agent.aiTap('the 扫码 (Scan QR) quick action button on home', { deepLocate: true });
      await sleep(2000);
      const afterTap = await inspect(agent, 'after-scan-tap');
      await captureScreen(
        agent,
        'T23 点扫码后',
        '点「扫码」后的界面（可能为权限弹窗或扫码界面）。',
        [
          `Purpose: ${afterTap.screenPurpose}`,
          `PermissionDialog: ${afterTap.isPermissionDialog} (${afterTap.permissionTitle ?? 'none'})`,
          `IsScanner: ${afterTap.isScanner}`,
          `Texts: ${afterTap.visibleTexts.join(' | ')}`,
        ].join('\n'),
      );
      summary.afterScanTap = afterTap;

      // 3) 若出现权限弹窗：等待用户手动允许。
      if (afterTap.isPermissionDialog) {
        console.log(`[t23] 检测到相机权限弹窗「${afterTap.permissionTitle ?? ''}」，请在设备上点「允许」…`);
        const permDeadline = Date.now() + 120000;
        while (Date.now() < permDeadline) {
          await sleep(5000);
          const p = await agent.aiQuery<{ isPermissionDialog: boolean }>(
            '观察当前界面。返回 JSON {isPermissionDialog: 是否仍有系统权限弹窗}。只观察。',
          );
          if (!p.isPermissionDialog) {
            console.log('[t23] 权限弹窗已消失（用户已处理）。');
            break;
          }
        }
      }

      // 4) 观察扫码界面。
      const scanner = await inspect(agent, 'scanner-open');
      await captureScreen(
        agent,
        'T23 扫码界面',
        '授权后的扫码/相机界面。',
        [
          `IsScanner: ${scanner.isScanner}`,
          `HasScanFrame: ${scanner.hasScanFrame}`,
          `Texts: ${scanner.visibleTexts.join(' | ')}`,
        ].join('\n'),
      );
      summary.scannerState = scanner;

      // 5) 安全退出扫码界面（返回，不扫描）。
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
        await sleep(1800);
      } catch (error) {
        console.log(`[t23] 退出扫码失败：${errorToString(error)}`);
      }
      const afterClose = await inspect(agent, 'after-close-scanner');
      await captureScreen(
        agent,
        'T23 退出扫码后',
        '退出扫码后的界面。',
        `Purpose: ${afterClose.screenPurpose}\nTexts: ${afterClose.visibleTexts.join(' | ')}`,
      );
      summary.afterClose = afterClose;

      // 6) 断言。
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({
        name: 'scan-entry-reachable',
        pass: afterTap.isPermissionDialog || afterTap.isScanner || afterTap.screenPurpose.includes('扫码'),
        message: afterTap.screenPurpose,
      });
      assertions.push({
        name: 'scanner-opens',
        pass: scanner.isScanner || scanner.hasScanFrame || scanner.screenPurpose.includes('扫码'),
        message: `IsScanner: ${scanner.isScanner} / HasScanFrame: ${scanner.hasScanFrame}`,
      });
      const closedOk = !afterClose.isScanner && (afterClose.screenPurpose.includes('首页') || afterClose.screenPurpose.includes('对话') || afterClose.screenPurpose.includes('钱包'));
      assertions.push({
        name: 'scanner-closable',
        pass: closedOk,
        message: afterClose.screenPurpose,
      });
      assertions.push({
        name: 'no-secret-exposed',
        pass: !scanner.hasSecretContent && !afterTap.hasSecretContent,
        message: '无敏感内容暴露',
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
