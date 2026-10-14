/**
 * T26 iOS 只读探查：转账确认卡的收款地址展示（issue 14）。
 *
 * 背景：issue 14 —— 转账确认卡不显示完整收款地址，只能输入尾 4 字符核对，
 * 聊天消息滚出屏幕后无法在卡上核对。
 * 本用例通过 AI 对话发起一笔小额转账草稿，到达确认卡后**只观察**：
 * 1) 聊天区是否显示了收款地址；2) 确认卡上是否显示收款地址（完整 or 截断）；
 * 3) 是否存在「输入最后 4 个字符」核对机制；4) 金额/网络/手续费展示。
 * 到确认卡即停，绝不点确认/签名/Face ID。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready，余额 ≥ 0.0001 ETH + Gas
 * 风险等级：🟡 只读到确认卡边界即停（不执行）。
 *
 * 运行：npm run test:ios:t26
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, requireEnv, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep } from './lib/device-kit.ts';

const AMOUNT_ETH = '0.0001';

type CardState = {
  screenPurpose: string;
  hasTransferCard: boolean;
  cardTexts: string[];
  buttons: Array<{ label: string; type: string }>;
  chatShowsAddress: boolean;
  chatAddressText: string | null;
  cardShowsAddress: boolean;
  cardAddressText: string | null;
  cardAddressTruncated: boolean;
  hasLast4Prompt: boolean;
  last4PromptText: string | null;
  amountOnCard: string | null;
  networkOnCard: string | null;
  feeOnCard: string | null;
  hasExecutionButton: boolean;
  executionLabels: string[];
  visibleTexts: string[];
};

async function inspectCard(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<CardState> {
  return agent.aiQuery<CardState>(
    [
      `观察当前 cowallet 转账确认界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'hasTransferCard：是否有转账确认/预览卡；',
      'cardTexts：确认卡上的可见文案数组（原样引用，可含收款地址——这是用户指定的安全地址）；',
      'buttons：卡片按钮数组 [{label, type}]，type 为 confirm/sign/cancel/other；',
      'chatShowsAddress：聊天区（确认卡上方的对话气泡）是否显示了收款地址；chatAddressText：其显示文本（完整或截断均可，原样引用）；',
      'cardShowsAddress：**确认卡本身**是否显示收款地址；cardAddressText：卡片上显示的地址文本；',
      'cardAddressTruncated：卡片上的地址是否被截断（如 0x1234…abcd 或只显示部分）；',
      'hasLast4Prompt：是否要求「输入收款地址最后 4 个字符/数字」来核对；last4PromptText：其提示文案；',
      'amountOnCard：卡片金额；networkOnCard：网络；feeOnCard：手续费；',
      'hasExecutionButton：是否出现 确认/签名/发送/授权 执行按钮；executionLabels：其文案；',
      'visibleTexts：当前界面主要可见文案。',
      '**只观察描述，绝对不要点击任何按钮，尤其不要点确认/签名/发送/Face ID。**',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t26-transfer-card-address-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
    amountEth: AMOUNT_ETH,
  };

  return runTest(ctx, summary, async () => {
    const receiver = requireEnv('TEST_SAFE_EVM_RECEIVER');
    if (!/^0x[a-fA-F0-9]{40}$/.test(receiver)) {
      throw new Error('TEST_SAFE_EVM_RECEIVER 不是合法 EVM 地址，终止。');
    }
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;
    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();
      await sleep(1500);

      try {
        await agent.aiTap('the 首页 (Home) bottom navigation tab', { deepLocate: true });
        await sleep(1500);
      } catch { /* ignore */ }
      const startState = await agent.aiQuery<{ state: string; evidence: string; balanceText: string | null }>(
        '观察当前 cowallet 首页。返回 JSON {state: fresh-install/email-registered-no-wallet/wallet-ready/unknown, evidence, balanceText}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T26 需要 wallet-ready，实际为 ${startState.state}。`);
      }
      console.log(`[t26] 起始余额：${startState.balanceText ?? '未知'}`);

      // 打开对话页。
      const check = await agent.aiQuery<{ hasTextInput: boolean }>('返回 JSON {hasTextInput: 是否有可输入文本框}。只观察。');
      if (!check.hasTextInput) {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
        await sleep(2500);
      }

      const prompt = `转 ${AMOUNT_ETH} ETH 给 ${receiver}`;
      await agent.aiTap('the AI chat message input field (输入问题...)', { deepLocate: true });
      await sleep(800);
      try {
        await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'replace' });
      } catch {
        await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'typeOnly' });
      }
      await sleep(500);
      await agent.aiTap('the send button in the chat input bar (发送)', { deepLocate: true });
      await sleep(1500);

      // 等待确认卡出现（最多约 90s）。
      let card: CardState | null = null;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        card = await inspectCard(agent, 'awaiting-confirm-card');
        if (card.hasTransferCard) break;
        await sleep(5000);
      }
      if (!card || !card.hasTransferCard) {
        summary.finalCard = card;
        throw new Error('90s 内未出现转账确认卡。可能余额不足、地址校验失败或 AI 未生成计划。');
      }

      summary.card = {
        chatAddressText: card.chatAddressText,
        cardAddressText: card.cardAddressText,
        cardAddressTruncated: card.cardAddressTruncated,
        last4PromptText: card.last4PromptText,
        amountOnCard: card.amountOnCard,
        networkOnCard: card.networkOnCard,
        feeOnCard: card.feeOnCard,
        cardTexts: card.cardTexts,
        executionLabels: card.executionLabels,
      };
      await captureScreen(
        agent,
        'T26 转账确认卡',
        '转账确认卡地址展示（只记录，不点按）。',
        [
          `ChatAddr: ${card.chatAddressText ?? 'n/a'}`,
          `CardAddr: ${card.cardAddressText ?? 'n/a'} (truncated=${card.cardAddressTruncated})`,
          `Last4Prompt: ${card.last4PromptText ?? 'n/a'}`,
          `Amount: ${card.amountOnCard ?? 'n/a'} / Net: ${card.networkOnCard ?? 'n/a'} / Fee: ${card.feeOnCard ?? 'n/a'}`,
          `Buttons: ${(card.buttons ?? []).map((b) => b.label).join('、') || 'none'}`,
        ].join('\n'),
      );

      const assertions = [
        {
          name: 'card-address-display-clarified',
          pass: true,
          message: `卡片显示地址=${card.cardAddressText ?? '无'}，截断=${card.cardAddressTruncated}，尾4核对=${card.hasLast4Prompt ? card.last4PromptText : '无'}`,
        },
        { name: 'amount-on-card', pass: Boolean(card.amountOnCard), message: card.amountOnCard ?? '无金额' },
        { name: 'no-execution', pass: true, message: '已停在确认卡，未点任何执行按钮' },
      ];
      summary.assertions = assertions;
      summary.status = 'reached-confirmation-card';
      console.log('[t26] ⏸ 已到确认卡，脚本停止，绝不点确认/签名/Face ID。');
      summary.midsceneReport = agent.reportFile ?? null;
    } finally {
      await agent.destroy().catch((error: unknown) => console.error(`[warn] agent.destroy 失败：${errorToString(error)}`));
    }
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(errorToString(error));
    process.exit(1);
  });
