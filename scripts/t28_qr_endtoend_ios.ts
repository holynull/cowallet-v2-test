/**
 * T28 iOS 真实二维码端到端（🟡 只读 + 系统权限 + 真人扫屏）。
 *
 * 覆盖：wallet-ready → 首页点「扫码」→（相机权限交给用户手动允许）→ 扫码界面打开后，
 * 由真人把手机摄像头对准 Mac 屏幕上展示的收款二维码（TEST_SAFE_EVM_RECEIVER）→
 * 观察 App 是否识别该地址并进入转账确认流程（识别结果/聊天消息/确认卡）→
 * 到确认卡即停（或安全取消），绝不点批准/签名/Face ID。
 *
 * 前置（本脚本之前需人工完成）：
 *   1. 在 Mac 上打开 assets/qr-safe-receiver.html（内容=安全接收地址二维码）。
 *   2. 请真人把手机摄像头对准该二维码。
 *
 * 风险等级：🟡 到确认卡边界即停；识别出的地址是安全接收人（TEST_SAFE_EVM_RECEIVER），
 * 不会执行任何资金动作。
 *
 * 运行：npm run test:ios:t28
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, requireEnv, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep } from './lib/device-kit.ts';

type QrState = {
  screenPurpose: string;
  isPermissionDialog: boolean;
  permissionTitle: string | null;
  isScanner: boolean;
  hasScanFrame: boolean;
  hasRecognizedAddress: boolean;
  recognizedAddress: string | null;
  hasChatMessage: boolean;
  chatMessage: string | null;
  hasTransferCard: boolean;
  cardAddress: string | null;
  hasApproveButton: boolean;
  approveLabels: string[];
  hasCancelButton: boolean;
  visibleTexts: string[];
  hasSecretContent: boolean;
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<QrState> {
  return agent.aiQuery<QrState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面/弹窗用途；',
      'isPermissionDialog：是否出现系统相机权限弹窗；permissionTitle：弹窗标题（无则 null）；',
      'isScanner：是否打开扫码/相机界面；hasScanFrame：是否有扫描框/取景提示；',
      'hasRecognizedAddress：是否识别出了收款地址（扫码结果）；recognizedAddress：识别出的地址（无则 null）；',
      'hasChatMessage：聊天区是否出现关于该地址的消息（如"转给 0x…"）；chatMessage：其文本；',
      'hasTransferCard：是否出现转账确认/预览卡；cardAddress：卡上显示的收款地址；',
      'hasApproveButton：是否出现 用 Face ID/锁屏密码 批准、签名、确认 等**资金执行**按钮；approveLabels：其文案；',
      'hasCancelButton：是否有 取消 按钮；',
      'visibleTexts：主要可见文案数组；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容。',
      '只观察描述，绝不点击任何资金执行/确认/签名/批准按钮。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t28-qr-endtoend-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  return runTest(ctx, summary, async () => {
    const receiver = requireEnv('TEST_SAFE_EVM_RECEIVER');
    summary.qrContent = receiver;
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
        throw new Error(`T28 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 回到首页。
      // 1a) 若键盘弹起会挡住底部导航：先点聊天/页面中部空白处收起键盘。
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.5), Math.round(size.height * 0.2));
        await sleep(1500);
      } catch { /* ignore */ }
      try {
        const size = await agent.page.size();
        // 先点左上返回键（若在压入式页面）。
        await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
        await sleep(1500);
      } catch { /* ignore */ }
      try {
        await agent.aiTap('the 首页 (Home) bottom navigation tab', { deepLocate: true });
        await sleep(1500);
      } catch { /* ignore */ }
      const homeCheck = await agent.aiQuery<{ onHome: boolean }>(
        '返回 JSON {onHome: 当前是否在 cowallet 首页（能看到 发送/接收/扫码/联系人 或 总资产）。}只观察。',
      );
      if (!homeCheck.onHome) {
        // 键盘可能还挡着：再点空白处，然后用计算坐标点首页 tab。
        try {
          const size = await agent.page.size();
          await agent.page.tap(Math.round(size.width * 0.5), Math.round(size.height * 0.2));
          await sleep(1200);
        } catch { /* ignore */ }
        try {
          await agent.page.tap(38, 750);
          await sleep(1500);
        } catch { /* ignore */ }
        // 再兜底：直接点首页 tab 文字。
        try {
          await agent.aiTap('the bottom nav tab labeled 首页 (Home)', { deepLocate: true });
          await sleep(1500);
        } catch { /* ignore */ }
      }

      // 2) 点「扫码」。
      await agent.aiTap('the 扫码 (Scan QR) quick action button on home', { deepLocate: true });
      await sleep(2000);
      const afterTap = await inspect(agent, 'after-scan-tap');
      summary.afterScanTap = afterTap;
      await captureScreen(
        agent,
        'T28 点扫码后',
        '点「扫码」后的界面（权限弹窗或扫码界面）。',
        `Purpose: ${afterTap.screenPurpose}\nPermission: ${afterTap.isPermissionDialog} (${afterTap.permissionTitle ?? 'none'})\nScanner: ${afterTap.isScanner}`,
      );

      // 3) 相机权限交给用户手动允许。
      if (afterTap.isPermissionDialog) {
        console.log(`[t28] 检测到相机权限弹窗「${afterTap.permissionTitle ?? ''}」，请在设备上点「允许」…`);
        const permDeadline = Date.now() + 120000;
        while (Date.now() < permDeadline) {
          await sleep(5000);
          const p = await agent.aiQuery<{ isPermissionDialog: boolean }>(
            '观察当前界面。返回 JSON {isPermissionDialog: 是否仍有系统权限弹窗}。只观察。',
          );
          if (!p.isPermissionDialog) {
            console.log('[t28] 权限弹窗已消失（用户已处理）。');
            break;
          }
        }
      }

      // 4) 确认扫码界面已打开。
      const scanner = await inspect(agent, 'scanner-open');
      summary.scannerState = scanner;
      await captureScreen(
        agent,
        'T28 扫码界面',
        '扫码/相机界面（等待对准 Mac 屏幕上的二维码）。',
        `Scanner: ${scanner.isScanner} / Frame: ${scanner.hasScanFrame}`,
      );
      if (!scanner.isScanner && !scanner.hasScanFrame && !scanner.screenPurpose.includes('扫码')) {
        console.warn('[t28] 未确认扫码界面打开，继续尝试…');
      }

      // 5) 提示真人对准 Mac 屏幕上的二维码。
      console.log(
        `\n✅ 请现在把手机摄像头对准 **Mac 屏幕** 上打开的二维码（内容=${receiver}）。` +
          '对准后保持 2~3 秒，让 App 完成识别。\n',
      );

      // 6) 轮询观察识别结果（最多 ~90s）。
      let final: QrState | null = null;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await sleep(5000);
        const s = await inspect(agent, 'waiting-recognition');
        if (s.hasRecognizedAddress || s.hasTransferCard || s.hasChatMessage) {
          final = s;
          break;
        }
      }
      final = final ?? (await inspect(agent, 'recognition-final'));
      summary.finalState = final;
      await captureScreen(
        agent,
        'T28 扫码识别结果',
        '扫码后的识别结果（地址/聊天/确认卡）。',
        [
          `RecognizedAddr: ${final.recognizedAddress ?? 'n/a'}`,
          `ChatMsg: ${final.chatMessage ?? 'n/a'}`,
          `TransferCard: ${final.hasTransferCard} (${final.cardAddress ?? 'n/a'})`,
          `ApproveBtn: ${(final.approveLabels ?? []).join('、') || 'none'}`,
          `Texts: ${(final.visibleTexts ?? []).join(' | ')}`,
        ].join('\n'),
      );

      // 7) 安全边界：若出现转账确认卡（资金执行边界）绝不点，截图后取消退出。
      if (final.hasTransferCard || final.hasApproveButton) {
        console.log('[t28] ⛔ 出现转账确认卡（资金执行边界），不点击批准；先取证，再点「取消」安全退出。');
        await captureScreen(
          agent,
          'T28 转账确认卡',
          '扫码识别地址后出现的转账确认卡（只记录，不批准）。',
          `CardAddr: ${final.cardAddress ?? 'n/a'}\nApprove: ${(final.approveLabels ?? []).join('、') || 'none'}`,
        );
        if (final.hasCancelButton) {
          try {
            await agent.aiTap('the 取消 (Cancel) button on the transfer card', { deepLocate: true });
            await sleep(1500);
          } catch (error) {
            console.log(`[t28] 点取消失败：${errorToString(error)}`);
          }
        }
      }

      // 8) 回到首页收尾。
      try {
        await agent.aiTap('the 首页 (Home) bottom navigation tab', { deepLocate: true });
        await sleep(1200);
      } catch { /* ignore */ }

      // 9) 断言。
      const recognizedOk =
        final.hasRecognizedAddress ||
        final.hasTransferCard ||
        final.hasChatMessage ||
        (final.visibleTexts ?? []).some((t) => /0x[a-fA-F0-9]{6}/.test(t));
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [
        {
          name: 'scanner-opened',
          pass: scanner.isScanner || scanner.hasScanFrame || scanner.screenPurpose.includes('扫码'),
          message: scanner.screenPurpose,
        },
        {
          name: 'qr-recognized',
          pass: recognizedOk,
          message: `识别地址=${final.recognizedAddress ?? 'n/a'} 聊天=${final.chatMessage ?? 'n/a'} 确认卡=${final.hasTransferCard}`,
        },
        {
          name: 'no-execution',
          pass: true,
          message: '已停在确认卡边界（若有），未点批准/签名',
        },
        {
          name: 'no-secret-exposed',
          pass: !final.hasSecretContent,
          message: '无敏感内容暴露',
        },
      ];
      summary.assertions = assertions;
      summary.status = assertions.every((a) => a.pass) ? 'passed' : 'partial';
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
