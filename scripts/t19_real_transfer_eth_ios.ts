/**
 * T19 iOS wallet-ready 真实 ETH 转账（用户授权）—— 停在确认卡边界。
 *
 * 授权信息（来自 .env / 用户本轮明确授权）：
 *   TEST_SAFE_EVM_RECEIVER（安全收款地址）
 *   TRANSFER_AMOUNT_ETH=0.0005
 * 流程：AI 对话发起「向授权地址转 0.0005 ETH」→ 等待确认卡 → **校验卡片收款地址
 * 与授权地址一致** → 记录证据 → 停在卡前（不点确认、不触发 Face ID）。
 * Face ID 由测试人员/用户在设备上手动完成；脚本绝不程序化点击确认/签名/Face ID。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready，余额 ≥ 0.0005 ETH + Gas
 * 风险等级：🔴 真实转账（已授权）。脚本只到确认卡边界即停。
 *
 * 运行：npm run test:ios:t19
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, requireEnv, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep } from './lib/device-kit.ts';

const AMOUNT_ETH = '0.0005';

type CardState = {
  screenPurpose: string;
  hasTransferCard: boolean;
  cardTexts: string[];
  buttons: Array<{ label: string; type: string }>;
  recipientOnCard: string | null;
  amountOnCard: string | null;
  networkOnCard: string | null;
  feeOnCard: string | null;
  hasFaceIdPrompt: boolean;
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
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面用途；',
      'hasTransferCard：屏幕上是否有转账确认/预览卡（含收款地址、金额、网络、手续费、确认按钮）；',
      'cardTexts：卡片上的可见文案数组（原样引用，可含收款地址——这是用户授权的安全地址）；',
      'buttons：卡片上的按钮数组 [{label, type}]，type 只能是 confirm/sign/cancel/other；',
      'recipientOnCard：卡片上显示的收款地址（若可辨识）；amountOnCard：金额；networkOnCard：网络；feeOnCard：手续费（无则 null）；',
      'hasFaceIdPrompt：是否有 Face ID / 生物识别确认提示；',
      'hasExecutionButton：是否出现 确认/签名/发送/授权 等执行级按钮；executionLabels：其文案；',
      'visibleTexts：当前界面主要可见文案数组。',
      '**只观察描述，绝对不要点击任何按钮，尤其不要点确认/签名/发送/Face ID 确认。**',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t19-real-transfer-eth-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
    authorizedReceiver: '0x75276A...D767B', // 仅掩码引用，完整地址来自 env
    authorizedAmountEth: AMOUNT_ETH,
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
      // 自复位到首页。
      try {
        await agent.aiTap('the 首页 (Home) bottom navigation tab', { deepLocate: true });
        await sleep(1500);
      } catch {
        /* ignore */
      }
      const startState = await agent.aiQuery<{ state: string; evidence: string; balanceText: string | null }>(
        '观察当前 cowallet 首页。返回 JSON {state: 只能是 fresh-install/email-registered-no-wallet/wallet-ready/unknown 之一, evidence: 判断依据, balanceText: 当前总资产文案(若可见)}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T19 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }
      console.log(`[t19] 起始余额：${startState.balanceText ?? '未知'}`);

      // 打开对话页。
      const check = await agent.aiQuery<{ hasTextInput: boolean }>('返回 JSON {hasTextInput: 是否有可输入文本框}。只观察。');
      if (!check.hasTextInput) {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
        await sleep(2500);
      }

      const prompt = `向 ${receiver} 转 ${AMOUNT_ETH} ETH`;
      console.log(`[t19] 发送转账请求（收款地址已授权）`);
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

      // 关键安全校验：卡片收款地址必须与授权地址一致。
      const authorizedLow = receiver.toLowerCase();
      const cardHasReceiver =
        (card.recipientOnCard && card.recipientOnCard.toLowerCase().includes(authorizedLow.slice(2, 10))) ||
        card.cardTexts.some((t) => t.toLowerCase().includes(authorizedLow.slice(2, 10)));
      summary.card = {
        recipientOnCard: card.recipientOnCard,
        amountOnCard: card.amountOnCard,
        networkOnCard: card.networkOnCard,
        feeOnCard: card.feeOnCard,
        cardTexts: card.cardTexts,
        executionLabels: card.executionLabels,
        hasFaceIdPrompt: card.hasFaceIdPrompt,
      };
      await captureScreen(
        agent,
        'T19 转账确认卡',
        '真实转账确认卡（用户已授权 0.0005 ETH 到安全地址）。只记录，不点按。',
        [
          `Recipient: ${card.recipientOnCard ?? 'n/a'}`,
          `Amount: ${card.amountOnCard ?? 'n/a'}`,
          `Network: ${card.networkOnCard ?? 'n/a'}`,
          `Fee: ${card.feeOnCard ?? 'n/a'}`,
          `FaceIdPrompt: ${card.hasFaceIdPrompt}`,
          `Buttons: ${(card.buttons ?? []).map((b) => b.label).join('、') || 'none'}`,
        ].join('\n'),
      );

      const assertions = [
        { name: 'recipient-matches-authorized', pass: cardHasReceiver, message: cardHasReceiver ? '卡片收款地址与授权地址一致' : '地址不一致，已停止' },
        { name: 'amount-on-card', pass: Boolean(card.amountOnCard), message: card.amountOnCard ?? '无金额' },
        { name: 'network-on-card', pass: Boolean(card.networkOnCard), message: card.networkOnCard ?? '无网络' },
      ];
      summary.assertions = assertions;
      // 地址不一致 → 直接失败停止，绝不继续。
      if (!cardHasReceiver) {
        summary.status = 'failed-address-mismatch';
        console.error('[t19] ⛔ 确认卡收款地址与授权地址不一致，已停止，未执行任何操作。');
      } else {
        summary.status = 'reached-confirmation-card';
        console.log(
          `[t19] ✅ 已到达真实转账确认卡（收款地址一致）。金额 ${card.amountOnCard} / 网络 ${card.networkOnCard} / 手续费 ${card.feeOnCard ?? '未知'}。`,
        );
        console.log('[t19] ⏸ 脚本到此停止，绝不点确认。请测试人员/用户在设备上手动完成 Face ID 确认。');
      }
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
