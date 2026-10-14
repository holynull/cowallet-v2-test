/**
 * T22 iOS 语音输入（麦克风/语音识别）流程（🟡 只读 + 系统权限交互）。
 *
 * 覆盖：wallet-ready → 对话页点「麦克风/语音输入」按钮 → 记录系统权限弹窗（语音识别/
 * 麦克风）→ 用户手动授权后 → 验证进入语音聆听态 → 安全停止（不发内容、不执行任何动作）。
 *
 * 说明：语音识别权限需用户在设备上手动点「允许」（SFSpeechRecognizer / 麦克风）。
 * 脚本只负责：点麦克风按钮、观察弹窗与聆听态、点「停止/取消」结束聆听。
 * 绝不点「发送」，绝不把识别出的文本当指令执行。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 仅权限交互 + 聆听态观察；不发送、不执行任何语音指令。
 *
 * 运行：npm run test:ios:t22
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type VoiceState = {
  screenPurpose: string;
  isPermissionDialog: boolean;
  permissionTitle: string | null;
  permissionButtons: string[];
  isListening: boolean;
  listeningLabel: string | null; // 聆听态提示文案（如 正在听/请说话/按住说话）
  hasStopOrCancel: boolean;
  stopOrCancelLabel: string | null;
  hasVoiceUI: boolean;
  visibleTexts: string[];
  hasSecretContent: boolean;
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<VoiceState> {
  return agent.aiQuery<VoiceState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面/弹窗用途；',
      'isPermissionDialog：是否出现系统权限弹窗（语音识别/麦克风）；permissionTitle：弹窗标题（无则 null）；permissionButtons：弹窗按钮数组；',
      'isListening：是否进入语音聆听/录音状态（正在听/请说话/波形/按住说话等）；listeningLabel：聆听态提示文案（无则 null）；',
      'hasStopOrCancel：是否有停止/取消/完成聆听的按钮；stopOrCancelLabel：其文案（无则 null）；',
      'hasVoiceUI：是否有语音输入界面（麦克风激活、波形等）；',
      'visibleTexts：主要可见文案数组；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容。',
      '只观察描述，绝对不要点「发送/发送并识别」或把识别文本当指令执行。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t22-voice-input-ios');
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
        throw new Error(`T22 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 进入对话页。
      try {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手 / 语音对话入口)', { deepLocate: true });
      } catch {
        await tapVisibleText(agent, 'AI助手', 2000);
      }
      await sleep(2500);
      const beforeMic = await inspect(agent, 'before-mic');
      const beforeTexts = new Set(beforeMic.visibleTexts ?? []);

      // 2) 点麦克风/语音输入按钮。
      await agent.aiTap('the microphone/voice input icon button (麦克风/语音输入, right of the text input)', {
        deepLocate: true,
      });
      await sleep(1500);
      const afterMicTap = await inspect(agent, 'after-mic-tap');
      await captureScreen(
        agent,
        'T22 点麦克风后',
        '点麦克风按钮后的界面（可能为权限弹窗或聆听态）。',
        [
          `Purpose: ${afterMicTap.screenPurpose}`,
          `PermissionDialog: ${afterMicTap.isPermissionDialog} (${afterMicTap.permissionTitle ?? 'none'})`,
          `IsListening: ${afterMicTap.isListening}`,
          `Texts: ${afterMicTap.visibleTexts.join(' | ')}`,
        ].join('\n'),
      );
      summary.afterMicTap = afterMicTap;

      // 3) 若出现权限弹窗：记录，交给用户手动授权；轮询等待授权完成后继续。
      if (afterMicTap.isPermissionDialog) {
        console.log(`[t22] 检测到系统权限弹窗「${afterMicTap.permissionTitle ?? ''}」，请在设备上点「允许」…`);
        const permDeadline = Date.now() + 120000; // 等 2 分钟授权
        while (Date.now() < permDeadline) {
          await sleep(5000);
          const p = await agent.aiQuery<{ isPermissionDialog: boolean }>(
            '观察当前界面。返回 JSON {isPermissionDialog: 是否仍有系统权限弹窗}。只观察。',
          );
          if (!p.isPermissionDialog) {
            console.log('[t22] 权限弹窗已消失（用户已处理）。');
            break;
          }
        }
        // 弹窗关闭后再点一次麦克风进入聆听态（若弹窗消失后没自动进入）。
        const afterPerm = await inspect(agent, 'after-permission');
        if (!afterPerm.isListening && !afterPerm.hasVoiceUI) {
          try {
            await agent.aiTap('the microphone/voice input icon button (麦克风/语音输入)', { deepLocate: true });
            await sleep(2500);
          } catch (error) {
            console.log(`[t22] 授权后再点麦克风失败：${errorToString(error)}`);
          }
        }
      }

      // 4) 观察聆听态。
      const listening = await inspect(agent, 'listening-state');
      await captureScreen(
        agent,
        'T22 语音聆听态',
        '授权后的语音聆听/录音态。',
        [
          `IsListening: ${listening.isListening}`,
          `ListeningLabel: ${listening.listeningLabel ?? 'none'}`,
          `HasVoiceUI: ${listening.hasVoiceUI}`,
          `Texts: ${listening.visibleTexts.join(' | ')}`,
        ].join('\n'),
      );
      summary.listeningState = listening;

      // 5) 安全停止聆听（不发送、不执行）。
      if (listening.isListening || listening.hasVoiceUI) {
        const stopLabel =
          listening.stopOrCancelLabel && listening.stopOrCancelLabel !== 'TestFlight'
            ? listening.stopOrCancelLabel
            : null;
        if (stopLabel && /停止|完成|取消|结束|收起|关闭/.test(stopLabel)) {
          await tapVisibleText(agent, stopLabel, 1500);
        } else {
          // 兜底：点输入框上方/输入区附近的安全位置结束聆听，或按返回。
          try {
            const size = await agent.page.size();
            await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
            await sleep(1500);
          } catch (error) {
            console.log(`[t22] 停止聆听失败：${errorToString(error)}`);
          }
        }
        await sleep(1500);
      }
      const afterStop = await inspect(agent, 'after-stop');
      await captureScreen(
        agent,
        'T22 停止聆听后',
        '停止聆听后的界面。',
        `Purpose: ${afterStop.screenPurpose}\nTexts: ${afterStop.visibleTexts.join(' | ')}`,
      );
      summary.afterStop = afterStop;

      // 6) 断言。
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({
        name: 'voice-entry-reachable',
        pass: afterMicTap.screenPurpose.includes('对话') || afterMicTap.hasVoiceUI || afterMicTap.isPermissionDialog,
        message: afterMicTap.screenPurpose,
      });
      // 聆听态证据：点麦克风后立即观察到聆听界面（isListening 或 hasVoiceUI）。
      const sawListening = afterMicTap.isListening || afterMicTap.hasVoiceUI || listening.isListening || listening.hasVoiceUI;
      assertions.push({
        name: 'voice-listening-ui',
        pass: sawListening,
        message: `点麦克风后 IsListening: ${afterMicTap.isListening} / HasVoiceUI: ${afterMicTap.hasVoiceUI} / 聆听态文案: ${afterMicTap.listeningLabel ?? ''}`,
      });
      // 停止后不得出现「新的」执行类内容：对比点击前文本差集，排除历史解释里的「签名」等字样。
      const newTexts = (afterStop.visibleTexts ?? []).filter((t) => !beforeTexts.has(t));
      const executionLike = newTexts.filter((t) => /确认卡|签名并|广播|已提交|转给 0x|发送中|额度用完|授权|批准/.test(t));
      assertions.push({
        name: 'stop-not-send',
        pass: executionLike.length === 0,
        message: executionLike.length ? `出现疑似执行内容: ${executionLike.join('；')}` : '停止后未产生新的转账/发送/签名动作',
      });
      assertions.push({
        name: 'no-secret-exposed',
        pass: !listening.hasSecretContent,
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
