/**
 * T08 iOS wallet-ready 设置 - 安全项只读观察。
 *
 * 覆盖设置页四个安全项：密钥检查 / 紧急冻结 / 自动锁定 / 风险防护。
 * 全部只读观察：密钥检查只看分片健康状态（不含密钥内容）；紧急冻结、自动锁定、
 * 风险防护只进入页面看说明与当前状态，**绝不拨动开关**（紧急冻结属不可逆状态变更）。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟡 只读。绝不切换紧急冻结/自动锁定开关，绝不导出/查看密钥。
 *
 * 运行：npm run test:ios:t08
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type SettingState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasToggle: boolean;
  toggleState: string | null;
  hasSecretContent: boolean;
  secretEvidence: string[];
  hasSafeBack: boolean;
  safeBackLabel: string | null;
};

const ITEMS = [
  { id: 'key-check', label: '密钥检查', risk: '只读，不看密钥内容' },
  { id: 'freeze', label: '紧急冻结', risk: '只观察，绝不拨动开关' },
  { id: 'auto-lock', label: '自动锁定', risk: '只观察，绝不拨动开关' },
  { id: 'risk-protection', label: '风险防护', risk: '只读说明' },
] as const;

async function inspect(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<SettingState> {
  return agent.aiQuery<SettingState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明页面用途；',
      'visibleTexts：主要可见文案数组（**不要复述任何助记词、私钥、恢复码、分片内容等敏感值**）；',
      'hasToggle：页面是否有可拨动的开关；toggleState：其当前状态（开/关/未知，无则 null）；',
      'hasSecretContent：页面是否正在展示助记词/私钥/恢复码/分片明文等敏感内容；',
      'secretEvidence：若有，仅列出触发判断的文案类别（不含具体值）；',
      'hasSafeBack：是否有安全返回按钮；safeBackLabel：其精确文案（无则 null）。',
      '只观察描述，绝对不要拨动任何开关、不要点击任何执行按钮。',
    ].join('\n'),
  );
}

async function safeReturn(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  state: SettingState,
  phase: string,
): Promise<void> {
  if (state.hasSafeBack && state.safeBackLabel && state.safeBackLabel !== 'TestFlight') {
    await tapVisibleText(agent, state.safeBackLabel, 1500);
    return;
  }
  try {
    const size = await agent.page.size();
    await agent.page.tap(Math.round(size.width * 0.08), Math.round(size.height * 0.09));
    await sleep(1500);
    console.log(`[t08] ${phase} 点左上角标准返回位置。`);
  } catch (error) {
    console.log(`[t08] ${phase} 返回失败：${errorToString(error)}`);
  }
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t08-settings-security-ios');
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
        [
          '观察当前 cowallet 界面，判断用户状态。返回 JSON：',
          'state：只能是 fresh-install、email-registered-no-wallet、wallet-ready、unknown 之一；',
          'evidence：一句话判断依据。只观察。',
        ].join('\n'),
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T08 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      await tapVisibleText(agent, '设置', 2000);
      const list = await inspect(agent, 'settings-list');
      await captureScreen(agent, 'T08 设置列表', '设置页顶层列表。', `Texts: ${list.visibleTexts.join(' | ')}`);

      const items: Array<Record<string, unknown>> = [];
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      for (const item of ITEMS) {
        console.log(`\n[t08] === ${item.id} === ${item.label}（${item.risk}）`);
        await tapVisibleText(agent, item.label, 2000);
        const state = await inspect(agent, item.id);
        items.push({
          id: item.id,
          label: item.label,
          screenPurpose: state.screenPurpose,
          visibleTexts: (state.visibleTexts ?? []).slice(0, 14),
          hasToggle: state.hasToggle,
          toggleState: state.toggleState,
          hasSecretContent: state.hasSecretContent,
        });
        await captureScreen(
          agent,
          `T08 - ${item.id}`,
          `设置项「${item.label}」页面（只读观察）。`,
          [
            `Item: ${item.label}`,
            `Purpose: ${state.screenPurpose}`,
            `Toggle: ${state.toggleState ?? 'none'}`,
            `SecretShown: ${state.hasSecretContent}`,
          ].join('\n'),
        );

        assertions.push({
          name: `${item.id}-reachable`,
          pass: state.visibleTexts.length > 0 && Boolean(state.screenPurpose),
          message: state.screenPurpose,
        });
        assertions.push({
          name: `${item.id}-no-secret-shown`,
          pass: !state.hasSecretContent,
          message: (state.secretEvidence ?? []).join('、') || 'no secret content',
        });

        await safeReturn(agent, state, item.id);
        await sleep(800);
      }

      summary.items = items;
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
