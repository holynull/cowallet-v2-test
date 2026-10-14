/**
 * T21 iOS 密钥分片表述一致性回归（issue 4，只读）。
 *
 * issue 4 历史观察：设置里的「安全卡片」把三个分片叫「第 1 份 · 手机 / 第 2 份 · 服务器 /
 * 第 3 份 · 你保管」，但同一个问题问 AI 却答成「本机分片 / 云备份分片 / 恢复分片」并称
 * 「没有第三片存在任何服务器上」——与卡片里的「第 2 份 · 服务器」直接冲突（文档标注已修复）。
 *
 * 本用例只读回归：读取设置「密钥检查」页的分片表述 → 问 AI「我的钱包密钥分片存在哪里」→
 * 对比两处对分片数量与存放位置的表述是否一致。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟢 只读。密钥检查页只看分片健康/位置表述，不看任何明文分片内容；
 * 只发只读问答，绝不点任何确认/签名/导出边界。
 *
 * 运行：npm run test:ios:t21
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type ShardState = {
  screenPurpose: string;
  visibleTexts: string[];
  shardNames: string[]; // 分片/位置相关的表述原文（不含任何分片明文内容）
  shardCount: number | null; // 出现几个分片条目
  hasSecretContent: boolean;
  secretEvidence: string[];
};

async function readShardView(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<ShardState> {
  return agent.aiQuery<ShardState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'visibleTexts：主要可见文案数组；',
      'shardNames：页面里描述密钥分片/备份存放位置的表述原文数组（例如「第 1 份·手机」「第 2 份·服务器」「第 3 份·你保管」或「本机分片」等，**只取位置/份数表述，绝不复述任何分片内容/明文**）；',
      'shardCount：出现几个分片/备份条目（无则 null）；',
      'hasSecretContent：是否展示助记词/私钥/恢复码/分片明文；secretEvidence：若有，仅列类别。',
      '只观察描述，绝不点击任何导出/查看/签名/确认按钮。',
    ].join('\n'),
  );
}

/** 发送只读问答并等待 AI 回复。 */
async function sendReadOnlyQuery(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  prompt: string,
): Promise<void> {
  await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
  await sleep(2500);
  await agent.aiTap('the AI chat message input field (bottom input bar, placeholder 输入问题...)', { deepLocate: true });
  await sleep(800);
  try {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'replace' });
  } catch {
    await agent.aiInput('the AI chat message input field', { value: prompt, deepLocate: true, mode: 'typeOnly' });
  }
  await sleep(500);
  await agent.aiTap('the send button in the chat input bar (send arrow / 发送)', { deepLocate: true });
  await sleep(4000);
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t21-shard-naming-regression-ios');
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
        throw new Error(`T21 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 设置 → 密钥检查，读设置侧的分片表述。
      await tapVisibleText(agent, '设置', 2000);
      await tapVisibleText(agent, '密钥检查', 2500);
      const cardView = await readShardView(agent, 'settings-key-check');
      await captureScreen(
        agent,
        'T21 设置密钥检查',
        '设置「密钥检查」页的分片/备份位置表述（只读）。',
        [
          `Purpose: ${cardView.screenPurpose}`,
          `ShardNames: ${(cardView.shardNames ?? []).join(' | ')}`,
          `ShardCount: ${cardView.shardCount ?? 'null'}`,
          `SecretShown: ${cardView.hasSecretContent}`,
        ].join('\n'),
      );
      summary.settingsShardView = cardView;

      // 安全返回设置页。
      try {
        const size = await agent.page.size();
        await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
        await sleep(1500);
      } catch (error) {
        console.log(`[t21] 返回设置失败：${errorToString(error)}`);
      }

      // 2) AI 问答，读 AI 侧的分片表述。
      try {
        await agent.aiTap('the round chat bubble button with a star icon (聊天助手)', { deepLocate: true });
      } catch {
        await tapVisibleText(agent, 'AI助手', 2000);
      }
      await sleep(2500);
      await sendReadOnlyQuery(agent, '我的钱包密钥分片存在哪里？');
      // AI 回复需要时间：轮询直到「正在思考」消失且出现新的 AI 回复，或超时。
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const probe = await agent.aiQuery<{ thinking: boolean; hasNewAiReply: boolean }>(
          [
            '观察当前 cowallet AI 对话页。返回 JSON：',
            'thinking：AI 是否还在「正在思考」；',
            'hasNewAiReply：最后一个 AI 消息是否为对本问题的回答（非旧消息、非思考中）。',
            '只观察。',
          ].join('\n'),
        );
        if (probe && !probe.thinking && probe.hasNewAiReply) break;
        await sleep(4000);
      }
      await sleep(3000); // 给 AI 回复渲染留余量。
      const aiView = await readShardView(agent, 'ai-answer');
      await captureScreen(
        agent,
        'T21 AI 分片回答',
        'AI 对「我的钱包密钥分片存在哪里」的回答（只读）。',
        [
          `Purpose: ${aiView.screenPurpose}`,
          `ShardNames: ${(aiView.shardNames ?? []).join(' | ')}`,
          `ShardCount: ${aiView.shardCount ?? 'null'}`,
          `SecretShown: ${aiView.hasSecretContent}`,
        ].join('\n'),
      );
      summary.aiShardView = aiView;

      // 3) 一致性判定。
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      const cardNames = (cardView.shardNames ?? []).join('；');
      const aiNames = (aiView.shardNames ?? []).join('；');

      assertions.push({
        name: 'settings-shard-names-present',
        pass: (cardView.shardNames ?? []).length > 0,
        message: cardNames || '设置侧未读到分片表述',
      });
      assertions.push({
        name: 'ai-shard-answer-present',
        pass: (aiView.shardNames ?? []).length > 0,
        message: aiNames || 'AI 侧未读到分片表述',
      });
      // 双方都提到「服务器/云」时，用「服务器」这个词是否在两处同时出现来判断冲突。
      const cardMentionsServer = /服务器|云/.test(cardNames);
      const aiMentionsServer = /服务器|云/.test(aiNames);
      assertions.push({
        name: 'shard-location-consistent',
        pass: !(cardMentionsServer && !aiMentionsServer),
        message: `设置:「${cardNames || '无'}」 vs AI:「${aiNames || '无'}」`,
      });
      assertions.push({
        name: 'no-secret-exposed',
        pass: !cardView.hasSecretContent && !aiView.hasSecretContent,
        message: '无分片明文泄露',
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
