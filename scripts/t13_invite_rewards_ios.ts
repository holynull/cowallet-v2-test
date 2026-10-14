/**
 * T13 iOS wallet-ready 邀请好友 / 积分（只读）。
 *
 * 覆盖：设置页「邀请好友，一起赚积分」入口 → 邀请页（分享文案/邀请码/积分规则）。
 * 只读观察：不真正触发系统分享到外部 App；若弹出系统分享面板，仅描述并取消。
 *
 * 平台：iOS 真机
 * App：app.getcowallet.wallet
 * 前置：wallet-ready
 * 风险等级：🟢 只读。不触达转账/签名/冻结；系统分享面板只取消不发送。
 *
 * 运行：npm run test:ios:t13
 */

import 'dotenv/config';

import { APP_ID, createIosAgent, createRunContext, runTest } from './lib/cowallet.ts';
import { captureScreen, errorToString, sleep, tapVisibleText } from './lib/device-kit.ts';

type InviteState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasSecretContent: boolean;
  secretEvidence: string[];
  isSystemShareSheet: boolean;
  hasSafeClose: boolean;
  safeCloseLabel: string | null;
  hasSendConfirm: boolean;
  confirmLabels: string[];
};

async function inspect(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<InviteState> {
  return agent.aiQuery<InviteState>(
    [
      `观察当前 cowallet / iOS 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面/面板用途；',
      'visibleTexts：主要可见文案数组（邀请码是公开邀请凭证，可正常引用；不要复述助记词/私钥等）；',
      'hasSecretContent：是否展示助记词/私钥/恢复码等敏感内容；secretEvidence：若有，仅列出类别；',
      'isSystemShareSheet：当前是否是 iOS 系统分享面板（AirDrop/微信/邮件等分享目标列表）；',
      'hasSafeClose：是否有安全的 取消/关闭/返回 按钮；safeCloseLabel：其文案（无则 null）；',
      'hasSendConfirm：是否出现发送/确认/签名/授权等执行级按钮；confirmLabels：其文案。',
      '只观察描述，绝不点击任何发送/确认/签名按钮；系统分享面板只取消不发送。',
    ].join('\n'),
  );
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t13-invite-rewards-ios');
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
        '观察当前 cowallet 界面。返回 JSON {state: 只能是 fresh-install/email-registered-no-wallet/wallet-ready/unknown 之一, evidence: 判断依据}。只观察。',
      );
      summary.startState = startState;
      if (startState.state !== 'wallet-ready') {
        throw new Error(`T13 需要 wallet-ready 起始状态，实际为 ${startState.state}。`);
      }

      // 1) 设置页找邀请入口。
      await tapVisibleText(agent, '设置', 2000);
      const settings = await inspect(agent, 'settings-invite-entry');
      await captureScreen(agent, 'T13 设置页邀请入口', '设置页顶部的邀请好友入口。', `Texts: ${settings.visibleTexts.join(' | ')}`);
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];
      assertions.push({ name: 'invite-entry-visible', pass: settings.visibleTexts.some((t) => /邀请|积分/.test(t)), message: settings.screenPurpose });

      // 2) 进入邀请页。
      await tapVisibleText(agent, '立即邀请', 2500);
      // 邀请页可能需加载（邀请码/积分规则来自服务端），轮询等待内容出现，最多约 20s。
      let invite = await inspect(agent, 'invite-page');
      const contentDeadline = Date.now() + 20_000;
      const LOADED_KEYWORDS = /邀请码|积分|已邀请|复制邀请/;
      while (
        Date.now() < contentDeadline &&
        !invite.visibleTexts.some((t) => LOADED_KEYWORDS.test(t))
      ) {
        await sleep(4000);
        invite = await inspect(agent, 'invite-page');
      }
      if (!invite.visibleTexts.some((t) => LOADED_KEYWORDS.test(t))) {
        console.warn('[t13] 邀请页内容 20s 内未加载出邀请码/积分信息（可能是网络或服务端问题）。');
      }
      await captureScreen(
        agent,
        'T13 邀请页',
        '邀请好友页面内容。',
        [
          `Purpose: ${invite.screenPurpose}`,
          `Texts: ${invite.visibleTexts.join(' | ')}`,
          `ShareSheet: ${invite.isSystemShareSheet}`,
        ].join('\n'),
      );
      assertions.push({ name: 'invite-page-reachable', pass: invite.visibleTexts.length > 0 && Boolean(invite.screenPurpose), message: invite.screenPurpose });
      assertions.push({ name: 'invite-no-secret', pass: !invite.hasSecretContent, message: (invite.secretEvidence ?? []).join('、') || 'no secret' });

      // 3) 若出现系统分享面板：只取消。
      if (invite.isSystemShareSheet) {
        summary.systemShareSheetShown = true;
        if (invite.hasSafeClose && invite.safeCloseLabel) {
          await tapVisibleText(agent, invite.safeCloseLabel, 1500);
        } else {
          // 系统分享面板通常有「关闭」按钮，点它或点面板外。
          try {
            await agent.aiTap('the 关闭 / Cancel / close button of the share sheet', { deepLocate: true });
          } catch (error) {
            console.log(`[t13] 分享面板关闭失败：${errorToString(error)}`);
          }
        }
        await sleep(1500);
      }

      summary.invitePage = invite;
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
