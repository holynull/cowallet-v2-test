/**
 * T18 iOS wallet-ready AI 对话历史面板（只读）。
 *
 * 覆盖：对话页打开「对话历史」面板 → 查看历史会话列表（应包含本会话发出的转账提示词）、
 * 新对话入口、关闭面板；只读，不删除/不新建对话（删除对话属数据操作，需用户授权后再做）。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready（已有若干 AI 对话历史）
 * 风险等级：🟢 只读。绝不删除历史/新建对话（会清空当前上下文）。
 *
 * 运行：npm run test:ios:t18
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type HistoryState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasNewChat: boolean;
  newChatLabels: string[];
  hasDelete: boolean;
  deleteLabels: string[];
  hasClose: boolean;
  closeLabel: string | null;
  hasSecretContent: boolean;
  secretEvidence: string[];
  hasTextInput: boolean;
};

async function inspect(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<HistoryState> {
  return agent.aiQuery<HistoryState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面/面板用途；',
      'visibleTexts：主要可见文案数组（历史会话标题可引用，但不要复述助记词/私钥等敏感值）；',
      'hasNewChat：是否有「新对话/新建会话」按钮；newChatLabels：其文案；',
      'hasDelete：是否有删除历史/清空对话等按钮；deleteLabels：其文案；',
      'hasClose：是否有关闭面板按钮；closeLabel：其文案（无则 null）；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容；secretEvidence：若有，仅列出类别；',
      'hasTextInput：是否有可输入的文本框。',
      '只观察描述，绝不点击删除/清空/新建对话等按钮。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t18-chat-history-ios');
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
      // 自复位：若在压入式页面（无底部导航），先按返回，再确保落在首页 tab。
      try {
        await tapVisibleText(agent, '首页', 1500);
      } catch {
        try {
          const size = await agent.page.size();
          await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
          await sleep(1500);
          await tapVisibleText(agent, '首页', 1500);
        } catch (error) {
          console.log(`[t18] 自复位失败：${errorToString(error)}`);
        }
      }
      const startState = await agent.aiQuery<{ state: string; evidence: string }>(
        '观察当前 cowallet 界面。返回 JSON {state: 只能是 fresh-install/email-registered-no-wallet/wallet-ready/unknown 之一, evidence: 判断依据}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T18 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 进入 AI 对话页。
      try {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
      } catch {
        await tapVisibleText(agent, 'AI助手', 2000);
      }
      await sleep(2500);
      const chat = await inspect(agent, 'chat-open');
      await captureScreen(agent, 'T18 对话页', 'AI 对话页。', `Texts: ${chat.visibleTexts.join(' | ')}`);
      summary.chatOpen = chat;

      // 2) 打开对话历史面板：左上角历史按钮（此前观察到对话页左上角是「对话历史」入口）。
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
        await sleep(2000);
      } catch (error) {
        console.log(`[t18] 打开对话历史失败：${errorToString(error)}`);
      }
      const history = await inspect(agent, 'history-panel');
      await captureScreen(
        agent,
        'T18 对话历史面板',
        'AI 对话历史面板。',
        `Texts: ${history.visibleTexts.join(' | ')}\nNewChat: ${(history.newChatLabels ?? []).join('、') || 'none'}\nDelete: ${(history.deleteLabels ?? []).join('、') || 'none'}`,
      );
      summary.historyPanel = history;

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({ name: 'history-panel-visible', pass: history.visibleTexts.length > 0 && Boolean(history.screenPurpose), message: history.screenPurpose });
      assertions.push({ name: 'history-no-secret', pass: !history.hasSecretContent, message: (history.secretEvidence ?? []).join('、') || 'no secret' });
      // 历史里应有本会话发出的转账提示词（对话优先产品的正常状态）。
      const hasHistoryEntries = history.visibleTexts.some((t) => /转|ETH|USDT|兑换|买/.test(t));
      assertions.push({ name: 'history-has-conversation-entries', pass: hasHistoryEntries, message: hasHistoryEntries ? '含对话历史条目' : '未识别到历史条目（面板可能为空）' });

      // 3) 关闭面板（只点「关闭」/返回，不新建不删除）。
      if (history.hasClose && history.closeLabel && history.closeLabel !== 'TestFlight') {
        await tapVisibleText(agent, history.closeLabel, 1500);
      } else {
        try {
          const size = await agent.page.size();
          await agent.page.tap(Math.round(size.width * 0.5), Math.round(size.height * 0.35));
          await sleep(1500);
        } catch (error) {
          console.log(`[t18] 关闭面板失败：${errorToString(error)}`);
        }
      }
      const afterClose = await inspect(agent, 'after-close');
      assertions.push({ name: 'panel-closable', pass: afterClose.hasTextInput || afterClose.visibleTexts.some((t) => /输入问题/.test(t)), message: afterClose.screenPurpose });

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
