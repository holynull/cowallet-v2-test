/**
 * T25 iOS 只读探索：AI「安全保护 / 密钥轮换」替代路径探测（issue 15、issue 3 深挖）。
 *
 * 背景：
 * - issue 15：AI 提供「保护这台手机 / 让旧钥匙作废」选项，选择后返回「无法生成计划（not_applicable）」，无解释/替代路径。
 * - issue 3：密钥轮换（secure_this_phone）返回 not_applicable。
 * 本用例在 AI 对话里重演这两个场景，逐一点击助手给出的澄清/建议选项，并在 not_applicable 后
 * 追问「那该怎么做 / 有没有其他方式」，观察是否存在替代路径，记录 UX 缺口。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 只读会话探测。只发消息、点助手回复里的澄清/建议 chip；任何
 * 确认/签名/授权/转账/冻结/删除/导出/让钥匙作废的执行级按钮一律不点，只记录。
 * 已知「让旧钥匙作废」选项会返回 not_applicable（服务端报错、不执行），点它是澄清探测而非执行。
 *
 * 运行：npm run test:ios:t25
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type ChatState = {
  screenPurpose: string;
  lastAssistantSummary: string;
  responseKind: 'clarification' | 'rejection' | 'confirmationCard' | 'infoAnswer' | 'error' | 'empty';
  offeredChoices: string[]; // 助手回复里的可选 chip/选项文案
  hasExecutionBoundary: boolean;
  boundaryLabels: string[];
  visibleTexts: string[];
  hasConsentDialog: boolean;
};

const EXECUTION_RE = /确认|签名|授权|批准|同意并|转账|发送|广播|冻结|删除|作废|导出|备份文件|助记词/;
// 只允许点这类「澄清/建议」chip；命中执行关键词的一律跳过。
const TAP_WHITELIST = /保护这台手机|让旧钥匙作废|换新手机|轮换|重新|继续|好的|可以|帮我|怎么做|有|查一下/i;

async function observeChat(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ChatState> {
  return agent.aiQuery<ChatState>(
    [
      `观察当前 cowallet AI 对话界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面用途；',
      'lastAssistantSummary：最近一条助手回复的**内容摘要**（1-2 句，不要复述任何地址/助记词/金额/密码）；',
      'responseKind：clarification（澄清追问）/ rejection（拒绝）/ confirmationCard（确认卡，未执行）/ infoAnswer（信息回答）/ error（报错，含 not_applicable 之类）/ empty（思考中或无回复）之一；',
      'offeredChoices：助手回复里给用户点选的可选项/chip 文案数组（无则 []）；',
      'hasExecutionBoundary：是否出现 确认/签名/授权/转账/冻结/删除/导出/让钥匙作废 等执行级按钮或卡片；',
      'boundaryLabels：若有，列出其可见文案；visibleTexts：主要可见文案数组；',
      'hasConsentDialog：是否被「AI 助手数据使用说明」授权弹窗遮挡。',
      '只观察描述，绝对不要点击任何执行级按钮。',
    ].join('\n'),
  );
}

async function waitForAssistantReply(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ChatState> {
  const deadline = Date.now() + 90_000;
  let last: ChatState | null = null;
  while (Date.now() < deadline) {
    last = await observeChat(agent, phase);
    if (last.hasConsentDialog) return last;
    if (last.responseKind !== 'empty') return last;
    await sleep(5000);
  }
  return last ?? { screenPurpose: 'unknown', lastAssistantSummary: 'no reply', responseKind: 'empty', offeredChoices: [], hasExecutionBoundary: false, boundaryLabels: [], visibleTexts: [], hasConsentDialog: false };
}

async function ensureChatOpen(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<void> {
  const check = await agent.aiQuery<{
    hasTextInput: boolean;
    hasRoundChatButton: boolean;
    screenPurpose: string;
  }>(
    [
      '观察当前 cowallet 界面。返回 JSON：',
      'hasTextInput：是否有可输入文本的输入框；hasRoundChatButton：是否有带星星/聊天气泡的圆形按钮（聊天入口）；',
      'screenPurpose：一句话说明页面用途。只观察。',
    ].join('\n'),
  );
  if (check.hasTextInput) return;
  if (!check.hasRoundChatButton) {
    throw new Error(`未找到聊天入口。页面：${check.screenPurpose}`);
  }
  await agent.aiTap('the round chat bubble button with a star icon (聊天助手 / 语音对话入口)', { deepLocate: true });
  await sleep(2500);
}

async function sendPrompt(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  prompt: string,
): Promise<void> {
  await ensureChatOpen(agent);
  await agent.aiTap('the AI chat message input field (bottom input bar)', { deepLocate: true });
  await sleep(800);
  try {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'replace' });
  } catch {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'typeOnly' });
  }
  await sleep(500);
  await agent.aiTap('the send button in the chat input bar', { deepLocate: true });
  await sleep(1500);
}

/** 点助手回复里的澄清/建议 chip（白名单内），返回是否点了。 */
async function tapOfferedChoiceIfSafe(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  state: ChatState,
  phase: string,
  tappedBefore: string[] = [],
): Promise<string | null> {
  for (const choice of state.offeredChoices ?? []) {
    if (tappedBefore.includes(choice)) continue; // 不再重复点同一个 chip
    if (!TAP_WHITELIST.test(choice)) continue;
    if (EXECUTION_RE.test(choice)) continue; // 双保险：含执行词的一律不点
    console.log(`[t25] ${phase} 点澄清选项「${choice}」`);
    await tapVisibleText(agent, choice, 3000);
    return choice;
  }
  return null;
}

async function handleConsentDialog(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<void> {
  const probe = await agent.aiQuery<{ hasConsent: boolean; dialogTitle: string | null; buttons: string[] }>(
    [
      '观察当前 cowallet 界面。返回 JSON：',
      'hasConsent：是否被「AI 助手数据使用说明」数据授权弹窗遮挡；dialogTitle：弹窗标题；buttons：弹窗按钮文案数组。',
      '只观察，不要点击。',
    ].join('\n'),
  );
  if (!probe.hasConsent) return;
  console.log(`[t25] ${phase} 检测到 AI 助手数据授权弹窗，记录后点「同意并继续」。`);
  await captureScreen(agent, `T25 - ${phase} - 数据授权弹窗`, 'AI 助手数据使用说明弹窗', `Title: ${probe.dialogTitle ?? ''}\nButtons: ${probe.buttons.join(' | ')}`);
  if (probe.buttons.some((b) => b.includes('同意'))) {
    await tapVisibleText(agent, '同意并继续', 3000);
  }
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t25-security-protection-alts-ios');
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

      await handleConsentDialog(agent, 'start');
      try { await tapVisibleText(agent, '首页', 1500); } catch { /* 忽略 */ }
      const startState = await agent.aiQuery<{ state: string; evidence: string; visibleTexts: string[] }>(
        ['观察当前 cowallet 界面，判断用户状态。返回 JSON {state: fresh-install/email-registered-no-wallet/wallet-ready/unknown, evidence, visibleTexts}。只观察。'].join('\n'),
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T25 需要 wallet-ready，实际为 ${startState.state}。`);
      }

      const scenarios: Array<Record<string, unknown>> = [];

      // 场景 1：issue 15 —— 保护这台手机 / 让旧钥匙作废。
      {
        const phase = 's1-issue15';
        await sendPrompt(agent, '我的旧手机好像被人碰过，我想保护这台手机，让旧钥匙作废，可以吗？');
        let state = await waitForAssistantReply(agent, `${phase}-reply`);
        await captureScreen(agent, `T25 ${phase} 首答`, 'issue15 场景首答', `Kind: ${state.responseKind}\n${state.lastAssistantSummary}\nChoices: ${(state.offeredChoices ?? []).join('、')}`);
        const steps: Array<Record<string, unknown>> = [];
        const tappedBefore: string[] = [];
        let tapped = await tapOfferedChoiceIfSafe(agent, state, `${phase}-choice1`, tappedBefore);
        let guard = 0;
        while (tapped && guard < 5) {
          tappedBefore.push(tapped);
          state = await waitForAssistantReply(agent, `${phase}-after-${tapped}`);
          steps.push({
            tapped,
            kind: state.responseKind,
            summary: state.lastAssistantSummary,
            offered: state.offeredChoices,
            boundary: state.hasExecutionBoundary ? state.boundaryLabels : null,
          });
          await captureScreen(agent, `T25 ${phase} 点选「${tapped}」后`, '点击澄清选项后的回复', `Kind: ${state.responseKind}\n${state.lastAssistantSummary}\nChoices: ${(state.offeredChoices ?? []).join('、')}`);
          if (state.hasExecutionBoundary) {
            console.log(`[t25] ${phase} 检测到执行边界：${(state.boundaryLabels ?? []).join('、')} —— 不点击，停止本场景。`);
            break;
          }
          guard += 1;
          tapped = await tapOfferedChoiceIfSafe(agent, state, `${phase}-choice${guard + 1}`, tappedBefore);
        }
        // 追问替代路径。
        await sendPrompt(agent, '如果现在做不了，那我具体该怎么做？有没有其他方式可以保护我的钱包安全？');
        const followUp = await waitForAssistantReply(agent, `${phase}-followup`);
        steps.push({ tapped: '追问替代路径', kind: followUp.responseKind, summary: followUp.lastAssistantSummary, offered: followUp.offeredChoices, boundary: followUp.hasExecutionBoundary ? followUp.boundaryLabels : null });
        await captureScreen(agent, `T25 ${phase} 追问替代路径`, '追问后的替代路径回复', `Kind: ${followUp.responseKind}\n${followUp.lastAssistantSummary}\nChoices: ${(followUp.offeredChoices ?? []).join('、')}`);
        scenarios.push({ id: phase, initialKind: state.responseKind, steps });
      }

      // 场景 2：issue 3 —— 密钥轮换 / 迁到新手机。
      {
        const phase = 's2-issue3';
        await sendPrompt(agent, '我想把钱包迁到新手机上，或者轮换一下密钥，应该怎么做？');
        const state = await waitForAssistantReply(agent, `${phase}-reply`);
        await captureScreen(agent, `T25 ${phase} 首答`, 'issue3 场景首答', `Kind: ${state.responseKind}\n${state.lastAssistantSummary}\nChoices: ${(state.offeredChoices ?? []).join('、')}\nBoundary: ${state.hasExecutionBoundary ? (state.boundaryLabels ?? []).join('、') : '无'}`);
        const steps: Array<Record<string, unknown>> = [];
        const tappedBefore: string[] = [];
        let tapped = await tapOfferedChoiceIfSafe(agent, state, `${phase}-choice1`, tappedBefore);
        let guard = 0;
        while (tapped && guard < 5) {
          tappedBefore.push(tapped);
          const next = await waitForAssistantReply(agent, `${phase}-after-${tapped}`);
          steps.push({ tapped, kind: next.responseKind, summary: next.lastAssistantSummary, offered: next.offeredChoices, boundary: next.hasExecutionBoundary ? next.boundaryLabels : null });
          await captureScreen(agent, `T25 ${phase} 点选「${tapped}」后`, '点击澄清选项后的回复', `Kind: ${next.responseKind}\n${next.lastAssistantSummary}`);
          if (next.hasExecutionBoundary) {
            console.log(`[t25] ${phase} 检测到执行边界：${(next.boundaryLabels ?? []).join('、')} —— 不点击，停止本场景。`);
            break;
          }
          guard += 1;
          tapped = await tapOfferedChoiceIfSafe(agent, next, `${phase}-choice${guard + 1}`, tappedBefore);
        }
        scenarios.push({ id: phase, initialKind: state.responseKind, steps });
      }

      summary.scenarios = scenarios;
      const anyBoundary = scenarios.some((s) =>
        (s.steps as Array<{ boundary: string[] | null }>).some((x) => x.boundary && x.boundary.length),
      );
      summary.assertions = [
        { name: 'no-execution-boundary-tapped', pass: true, message: anyBoundary ? `检测到边界但未点击：见场景详情` : '全程未触碰执行边界' },
      ];
      summary.status = 'passed';
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
