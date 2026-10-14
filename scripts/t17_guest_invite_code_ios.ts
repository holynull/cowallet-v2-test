/**
 * T17 iOS 邀请码入口探索：确认邮箱登录页「有邀请码？」入口可展开邀请码输入，
 * 输入框与提示可读，且可安全收起/返回。不输入内容、不提交。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install；WDA 已就绪
 * 风险等级：🟢 只读。不输入邀请码、不提交表单、不发送 OTP。
 *
 * 运行：npm run test:ios:t17
 */

import 'dotenv/config';

import {
  APP_ID,
  createIosAgent,
  createRunContext,
  detectUserState,
  runTest,
} from './lib/cowallet.ts';
import {
  assertVisible,
  captureScreen,
  errorToString,
  launchApp,
  sleep,
  tapVisibleText,
} from './lib/device-kit.ts';

type InviteState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasInviteField: boolean;
  hasCollapseOrClose: boolean;
};

async function inspectInvite(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  label: string,
): Promise<InviteState> {
  return agent.aiQuery<InviteState>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${label}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasInviteField：是否出现邀请码输入框；hasCollapseOrClose：是否有可收起/关闭邀请码输入的控件。',
      '只观察描述，不要点击、不要输入。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t17-guest-invite-code-ios');
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

      await launchApp(agent, APP_ID.ios);
      const startState = await detectUserState(agent);
      summary.startState = startState;
      console.log(`[state] ${startState.state} — ${startState.evidence}`);
      if (startState.state === 'wallet-ready') {
        throw new Error('T17 需要未登录起始状态，实际为 wallet-ready。');
      }

      // 进入邮箱登录页。
      await tapVisibleText(agent, '登录 / 恢复已有钱包', 2000);
      const login = await inspectInvite(agent, 'login-page');
      summary.loginPage = login;

      const hasInviteEntry = await agent.aiQuery<{ hasInviteEntry: boolean }>(
        '当前邮箱登录页是否可见「有邀请码？」或等价的邀请码入口？返回 JSON：hasInviteEntry。',
      );
      summary.hasInviteEntry = hasInviteEntry;

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      if (!hasInviteEntry.hasInviteEntry) {
        assertions.push({
          name: 'invite-entry-visible',
          pass: false,
          message: '邮箱登录页未找到「有邀请码？」入口',
        });
      } else {
        assertions.push({ name: 'invite-entry-visible', pass: true });

        await tapVisibleText(agent, '有邀请码', 1500);
        const expanded = await inspectInvite(agent, 'invite-expanded');
        summary.inviteExpanded = expanded;
        await captureScreen(
          agent,
          'T17 邀请码输入展开',
          '点「有邀请码？」后展开的邀请码输入区域。',
          [
            `Has invite field: ${expanded.hasInviteField}`,
            `Texts: ${expanded.visibleTexts.join(' | ') || 'none'}`,
          ].join('\n'),
        );

        const fieldAssert = await assertVisible(
          agent,
          '当前页面出现了邀请码输入框或邀请码输入提示。',
          '点「有邀请码？」后未出现邀请码输入区域。',
        );
        assertions.push({ name: 'invite-field-appears', ...fieldAssert });

        // 收起/返回：优先点「有邀请码？」再次收起；无则返回按钮。
        if (expanded.hasCollapseOrClose) {
          await tapVisibleText(agent, '有邀请码', 1200);
        } else {
          const back = await agent.aiQuery<{ hasBack: boolean; backLabel: string | null }>(
            '当前页面是否有返回按钮？返回 JSON：hasBack、backLabel。',
          );
          if (back.hasBack && back.backLabel) {
            await tapVisibleText(agent, back.backLabel, 1200);
          }
        }
      }

      // 回到引导页（relaunch 兜底，确保结束态可控）。
      try {
        await agent.terminate(APP_ID.ios);
      } catch {
        // ignore
      }
      await sleep(800);
      await launchApp(agent, APP_ID.ios);
      await sleep(1000);

      const endState = await detectUserState(agent);
      summary.endState = endState;
      console.log(`[state] end ${endState.state} — ${endState.evidence}`);

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
