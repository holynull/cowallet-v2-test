/**
 * T27 iOS 语音一句话实测（端到端，🟡 只读查询，不执行任何转账）。
 *
 * 覆盖：wallet-ready → 对话页点「麦克风/语音输入」→（权限弹窗交给用户手动允许）→
 * 聆听态出现后，由真人对着手机说一句话「查查我还有多少钱」→ 识别文本进入输入框 →
 * 校验是**查询类**指令后点「发送」提交（发送聊天消息是常规对话动作，非资金执行）→
 * 观察 AI 是否理解并回答余额/资产。
 *
 * 安全边界：仅当识别文本为**查询类**（含 余额/多少钱/查/看/多少）才发送；
 * 若识别为 转账/兑换/发送给 等资金指令，直接停止并把识别结果交给人工。
 * 聊天输入框的「发送」按钮=提交对话消息（与 T19/T26 发指令一致），不算资金执行；
 * 真正的执行边界是确认卡上的「用 Face ID/锁屏密码 批准」「签名」「确认」按钮——绝不点。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 语音查询（查询余额不产生资金移动）；用户手动说话 + 可能手动授权权限。
 *
 * 运行：npm run test:ios:t27
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

const SPEAK_INSTRUCTION = '查查我还有多少钱';
const SPEAK_INSTRUCTION_HINT =
  '✅ 请现在对着手机（麦克风附近）清晰说一句话：「查查我还有多少钱」。说完后稍等，脚本会观察 AI 是否理解并回答。';

type VoiceE2EState = {
  screenPurpose: string;
  isPermissionDialog: boolean;
  permissionTitle: string | null;
  isListening: boolean;
  listeningLabel: string | null;
  hasRecognizedText: boolean;
  recognizedText: string | null;
  hasAssistantReply: boolean;
  assistantReply: string | null;
  hasTransferCard: boolean; // 是否出现转账确认/预览卡
  hasApproveButton: boolean; // 确认卡上的 批准/签名/确认 资金执行按钮
  visibleTexts: string[];
  hasExecutionButton: boolean;
  executionLabels: string[];
  hasSecretContent: boolean;
};

async function inspect(agent: Awaited<ReturnType<typeof createIosAgent>>['agent'], phase: string): Promise<VoiceE2EState> {
  return agent.aiQuery<VoiceE2EState>(
    [
      `观察当前 cowallet 对话界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前界面；',
      'isPermissionDialog：是否出现系统权限弹窗（语音识别/麦克风）；permissionTitle：弹窗标题（无则 null）；',
      'isListening：是否正在语音聆听/录音（正在听/请说话/波形）；listeningLabel：聆听态文案（无则 null）；',
      'hasRecognizedText：是否出现了识别出的文字（语音转写结果）；recognizedText：其文本（无则 null）；',
      'hasAssistantReply：AI 助手是否已回复/输出了回答；assistantReply：最近一条助手回答文本（无则 null）；',
      'hasTransferCard：是否出现转账确认/预览卡（有 收款地址/网络手续费/批准 等转账要素）；',
      'hasApproveButton：转账确认卡上是否出现 用 Face ID/锁屏密码 批准、签名、确认 等**资金执行**按钮；',
      'visibleTexts：主要可见文案数组；',
      'hasExecutionButton：是否出现**资金执行**按钮（确认/签名/批准/授权，特指转账卡上的执行动作，不含聊天输入框的发送）；executionLabels：其文案；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容。',
      '只观察描述，绝不点击任何资金执行/确认/签名/批准按钮。',
    ].join('\n'),
  );
}

/** 判断识别文本是否为「查询类」指令（可安全发送）。 */
function isQueryIntent(text: string): boolean {
  return /余额|多少钱|多少币|资产|查|看|还有|多少钱|剩/.test(text);
}

/** 判断识别文本是否含资金动作（必须拦截，不得发送）。 */
function isFundMovementIntent(text: string): boolean {
  return /转|发(给|送)|给.{0,12}(ETH|USDT|USDC|币)|兑换|买|卖|提现|充值|打款|转账/.test(text);
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t27-voice-onesentence-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
    expectedPhrase: SPEAK_INSTRUCTION,
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
        throw new Error(`T27 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 进入对话页。
      try {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手 / 语音对话入口)', { deepLocate: true });
      } catch {
        await tapVisibleText(agent, 'AI助手', 2000);
      }
      await sleep(2500);

      // 2) 先清理输入区：收起键盘、清空输入框，避免残留影响。
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.5), Math.round(size.height * 0.45));
        await sleep(800);
      } catch { /* ignore */ }
      const cleanCheck = await inspect(agent, 'after-clean');
      console.log(`[t27] 清理后：hasTransferCard=${cleanCheck.hasTransferCard} 仍在对话页=${cleanCheck.screenPurpose.includes('对话') || cleanCheck.screenPurpose.includes('CoWallet')}`);

      // 3) 点麦克风/语音输入按钮。
      await agent.aiTap('the microphone/voice input icon button (麦克风/语音输入, right of the text input)', {
        deepLocate: true,
      });
      await sleep(1500);
      const afterMic = await inspect(agent, 'after-mic-tap');
      summary.afterMicTap = afterMic;
      await captureScreen(
        agent,
        'T27 点麦克风后',
        '点麦克风按钮后的界面（权限弹窗或聆听态）。',
        `Purpose: ${afterMic.screenPurpose}\nListening: ${afterMic.isListening} (${afterMic.listeningLabel ?? 'n/a'})`,
      );

      // 4) 权限弹窗交给用户手动允许。
      if (afterMic.isPermissionDialog) {
        console.log(`[t27] 检测到系统权限弹窗「${afterMic.permissionTitle ?? ''}」，请在设备上点「允许」…`);
        const permDeadline = Date.now() + 120000;
        while (Date.now() < permDeadline) {
          await sleep(5000);
          const p = await agent.aiQuery<{ isPermissionDialog: boolean }>(
            '观察当前界面。返回 JSON {isPermissionDialog: 是否仍有系统权限弹窗}。只观察。',
          );
          if (!p.isPermissionDialog) {
            console.log('[t27] 权限弹窗已消失（用户已处理）。');
            break;
          }
        }
        // 授权后若未自动进入聆听，再点一次麦克风。
        const afterPerm = await inspect(agent, 'after-permission');
        if (!afterPerm.isListening) {
          try {
            await agent.aiTap('the microphone/voice input icon button (麦克风/语音输入)', { deepLocate: true });
            await sleep(2500);
          } catch (error) {
            console.log(`[t27] 授权后再点麦克风失败：${errorToString(error)}`);
          }
        }
      }

      // 5) 确认已进入聆听态，然后请真人说话。
      const listening = await inspect(agent, 'listening-state');
      if (!listening.isListening) {
        // 也许需要再点一次
        try {
          await agent.aiTap('the microphone/voice input icon button (麦克风/语音输入)', { deepLocate: true });
          await sleep(2500);
        } catch (error) {
          console.log(`[t27] 进入聆听态失败：${errorToString(error)}`);
        }
      }
      const listening2 = await inspect(agent, 'listening-state-2');
      await captureScreen(
        agent,
        'T27 聆听态（等用户说话）',
        '语音聆听态，等待真人说话。',
        `Listening: ${listening2.isListening} (${listening2.listeningLabel ?? 'n/a'})`,
      );
      summary.listeningState = listening2;
      console.log(`\n${SPEAK_INSTRUCTION_HINT}\n`);

      // 6) 轮询观察识别文本进入输入框（最多 ~90s）。
      let recognized: VoiceE2EState | null = null;
      let polls = 0;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await sleep(5000);
        const s = await inspect(agent, 'waiting-recognition');
        polls += 1;
        // 有识别文本 → 结束；聆听态结束且已过至少两轮（10s）且无文本 → 结束。
        if (s.hasRecognizedText || (polls >= 2 && !s.isListening)) {
          recognized = s;
          break;
        }
      }
      recognized = recognized ?? (await inspect(agent, 'recognition-final'));
      summary.recognizedState = recognized;
      await captureScreen(
        agent,
        'T27 语音识别结果',
        '真人说话后的语音转写结果（输入框）。',
        [
          `Recognized: ${recognized.recognizedText ?? 'n/a'}`,
          `Texts: ${(recognized.visibleTexts ?? []).join(' | ')}`,
        ].join('\n'),
      );

      const recognizedText = recognized.recognizedText ?? '';
      // 安全校验：资金动作指令必须拦截。
      if (recognizedText && isFundMovementIntent(recognizedText)) {
        console.log(`[t27] ⛔ 识别到资金动作指令：「${recognizedText}」。按安全边界停止，不发送。交给人工处理。`);
        summary.status = 'stopped-fund-movement-intent';
        summary.assertions = [
          { name: 'fund-intent-blocked', pass: true, message: `识别到「${recognizedText}」已拦截不发送` },
        ];
        return;
      }

      // 7) 结束聆听态（点「完成/取消/点击任意处结束」），准备发送。
      if (recognized.isListening) {
        try {
          const stopLabel =
            recognized.listeningLabel && /停止|完成|取消|结束/.test(recognized.listeningLabel) ? recognized.listeningLabel : null;
          if (stopLabel) {
            await tapVisibleText(agent, stopLabel, 1500);
          } else {
            const size = await agent.page.size();
            await agent.page.tap(Math.round(size.width * 0.5), Math.round(size.height * 0.45));
            await sleep(1500);
          }
        } catch (error) {
          console.log(`[t27] 停止聆听失败：${errorToString(error)}`);
        }
      }

      // 8) 若识别文本为空则停止（未收到语音），否则点「发送」提交查询消息。
      if (!recognizedText) {
        console.log('[t27] ⚠️ 90s 内未识别到语音文本（可能没听到/聆听超时）。停止。');
        summary.status = 'no-speech-recognized';
        summary.assertions = [{ name: 'recognized', pass: false, message: '未识别到语音文本' }];
        return;
      }
      if (!isQueryIntent(recognizedText)) {
        console.log(`[t27] ⚠️ 识别文本「${recognizedText}」不是明确查询类，停止发送，交给人工。`);
        summary.status = 'ambiguous-intent';
        summary.assertions = [{ name: 'intent-clarified', pass: false, message: `识别文本：${recognizedText}` }];
        return;
      }
      await agent.aiTap('the 发送 (send) button in the chat input bar', { deepLocate: true });
      await sleep(2000);
      console.log(`[t27] 已发送查询：「${recognizedText}」`);

      // 9) 轮询观察 AI 回复（最多 ~90s）。
      let final: VoiceE2EState | null = null;
      const replyDeadline = Date.now() + 90_000;
      while (Date.now() < replyDeadline) {
        await sleep(5000);
        const s = await inspect(agent, 'waiting-reply');
        if (s.hasAssistantReply || s.hasTransferCard) {
          final = s;
          break;
        }
      }
      final = final ?? (await inspect(agent, 'reply-final'));
      summary.finalState = final;
      await captureScreen(
        agent,
        'T27 语音查询回复结果',
        '语音查询发送后的 AI 回复（余额/资产）。',
        [
          `Sent: ${recognizedText}`,
          `Assistant: ${final.assistantReply ?? 'n/a'}`,
          `TransferCard: ${final.hasTransferCard}`,
          `ApproveButton: ${final.hasApproveButton}`,
        ].join('\n'),
      );

      // 10) 安全收尾：若出现转账确认卡（资金执行边界）绝不点。
      if (final.hasTransferCard || final.hasApproveButton) {
        console.log('[t27] ⛔ 出现转账确认卡（资金执行边界），按安全边界停止，不点击。');
        summary.status = 'stopped-at-execution-boundary';
        summary.assertions = [{ name: 'execution-boundary-respected', pass: true, message: '出现确认卡即停' }];
        return;
      }

      // 11) 断言：查询类指令被理解并回答（余额/资产），未产生执行动作。
      const replyText = (final.assistantReply ?? '') + ' ' + (final.visibleTexts ?? []).join(' ');
      const answeredBalance = /资产|余额|USD|\$|ETH|多少|总资产|0\.\d/.test(replyText);
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [
        {
          name: 'voice-listening-ui',
          pass: listening.isListening || listening2.isListening,
          message: `聆听态: ${listening2.listeningLabel ?? 'n/a'}`,
        },
        {
          name: 'voice-recognized-text',
          pass: Boolean(recognizedText),
          message: `识别文本: ${recognizedText}`,
        },
        {
          name: 'assistant-replied-balance-query',
          pass: final.hasAssistantReply && answeredBalance,
          message: `回复: ${(final.assistantReply ?? '').slice(0, 120)}`,
        },
        {
          name: 'no-execution',
          pass: !final.hasTransferCard && !final.hasApproveButton,
          message: '未出现转账确认卡 / 未执行任何资金动作',
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
