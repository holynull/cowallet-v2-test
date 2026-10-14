/**
 * T03 iOS 未登录入口覆盖：确认 fresh-install 状态下注册 / 登录 / 恢复入口可见、可点、
 * 首步可达，且存在安全返回路径。只读用例，不发送 OTP、不提交邮箱/助记词/任何表单。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install 状态；WDA 已就绪（复用长驻服务）
 * 风险等级：🟢 只读。绝不进入确认 / 签名 / 授权 / 导出密钥等执行边界。
 *
 * 运行：npm run test:ios:t03
 */

import 'dotenv/config';

import {
  APP_ID,
  createIosAgent,
  createRunContext,
  detectUserState,
  runTest,
  type WalletUserState,
} from './lib/cowallet.ts';
import {
  assertVisible,
  captureScreen,
  errorToString,
  launchApp,
  sleep,
  tapVisibleText,
} from './lib/device-kit.ts';

type EntryPhase = {
  phase: string;
  screenPurpose: string;
  visibleTexts: string[];
  hasBackOrCancel: boolean;
  safeBackLabel: string | null;
};

/**
 * 只接受语义明确的安全返回标签。AI 视觉可能把页面上任意按钮误判成"返回"，
 * 例如上一轮把左上角 TestFlight 按钮识别成 safeBackLabel 并点进去，
 * 导致流程脱轨。这里用关键词白名单兜底。
 */
const SAFE_BACK_KEYWORDS = ['返回', '取消', '关闭', '完成', 'Back', 'Cancel', 'Close', '×', '✕', '❌'];

function isSafeBackLabel(label: string | null | undefined): label is string {
  if (!label) return false;
  const trimmed = label.trim();
  if (trimmed.length === 0) return false;
  return SAFE_BACK_KEYWORDS.some((keyword) => trimmed.includes(keyword));
}

/** 语义读取当前页面：页面用途、可见文案、是否有安全返回/取消路径。 */
async function inspectEntryScreen(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<EntryPhase> {
  const info = await agent.aiQuery<{
    screenPurpose: string;
    visibleTexts: string[];
    hasBackOrCancel: boolean;
    safeBackLabel: string | null;
  }>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasBackOrCancel：是否有安全的返回/关闭/取消按钮（不会提交任何数据、不会触发验证码）；',
      'safeBackLabel：那个安全按钮的精确可见文案；没有就返回 null。',
      '只观察和描述，不要点击、不要提交任何表单。',
    ].join('\n'),
  );
  return { phase, ...info };
}

async function safeBack(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: EntryPhase,
): Promise<'backed' | 'no-safe-path' | 'relaunch'> {
  if (!phase.hasBackOrCancel || !isSafeBackLabel(phase.safeBackLabel)) {
    console.log(
      `[t03] ${phase.phase} 无语义明确的安全返回按钮（AI 返回：${phase.safeBackLabel ?? 'null'}），改用 relaunch 回到起始态。`,
    );
    await relaunchToStart(agent);
    return 'relaunch';
  }
  await tapVisibleText(agent, phase.safeBackLabel);
  return 'backed';
}

/** 重新启动 App，把界面恢复到 fresh-install 起始态（重启是安全的可逆操作）。 */
async function relaunchToStart(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<void> {
  try {
    await agent.terminate(APP_ID.ios);
  } catch {
    // App 可能不在前台，terminate 失败可忽略。
  }
  await sleep(800);
  await launchApp(agent, APP_ID.ios);
  await sleep(1000);
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t03-unauthenticated-entry-ios');
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

      await captureScreen(
        agent,
        'T03 未登录入口覆盖 - 起始',
        'T03 起始页（fresh-install 欢迎引导）。',
        [
          `Bundle id: ${APP_ID.ios}`,
          `Device: ${deviceId}`,
          `起始状态: ${startState.state}`,
          '只读探索：不提交邮箱 / OTP / 助记词，不进入确认与签名页。',
        ].join('\n'),
      );

      const phases: EntryPhase[] = [];
      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      // 断言 1：起始必须是没有登录的引导状态（fresh-install 或等价未登录态）。
      if (startState.state === 'wallet-ready') {
        throw new Error(
          `T03 需要未登录起始状态，实际为 wallet-ready。请先在设备上登出/清到 fresh-install 再跑。evidence: ${startState.evidence}`,
        );
      }

      // 断言 2：两个关键入口必须可见。
      // 注意：App 引导流程会跨重启记住进度（T01 欢迎页「开始使用」→ 点过后进入
      // 「钱包保护介绍页」），所以创建入口的文案可能是「开始使用」或「开始创建」，
      // 这里同时兼容两种 CTA。
      const entryVisible = await agent.aiQuery<{
        startUseVisible: boolean;
        startCreateVisible: boolean;
        loginRecoverVisible: boolean;
      }>(
        '观察当前 cowallet 引导页。返回 JSON：startUseVisible（是否可见「开始使用」入口）、startCreateVisible（是否可见「开始创建」或等价的创建钱包入口）、loginRecoverVisible（是否可见「登录 / 恢复已有钱包」或等价登录/恢复入口）。',
      );
      summary.entryVisibility = entryVisible;

      const startUseAssert = await assertVisible(
        agent,
        '当前 cowallet 界面可见「开始使用」或「开始创建」或等价的注册/创建钱包入口。',
        '未发现创建钱包入口。',
      );
      assertions.push({ name: 'start-use-entry', ...startUseAssert });

      const recoverAssert = await assertVisible(
        agent,
        '当前 cowallet 界面可见「登录 / 恢复已有钱包」或等价的登录/恢复入口。',
        '未发现登录/恢复入口。',
      );
      assertions.push({ name: 'login-recover-entry', ...recoverAssert });

      // 阶段 A：点创建入口（「开始使用」或「开始创建」），只记录第一步，不提交任何数据。
      const createEntryLabel =
        entryVisible.startUseVisible === true
          ? '开始使用'
          : entryVisible.startCreateVisible === true
            ? '开始创建'
            : null;
      if (createEntryLabel) {
        await tapVisibleText(agent, createEntryLabel);
        const phase = await inspectEntryScreen(agent, 'start-use-flow');
        phases.push(phase);
        await captureScreen(
          agent,
          'T03 - 创建钱包流程',
          `点「${createEntryLabel}」后到达的第一步（未提交任何数据）。`,
          [
            `Page: ${phase.screenPurpose}`,
            `Texts: ${phase.visibleTexts.join(' | ') || 'none'}`,
            `Safe back: ${phase.safeBackLabel || 'none'}`,
          ].join('\n'),
        );

        const boundary = await assertVisible(
          agent,
          '当前页面处于创建钱包流程的起始步骤（如邮箱输入或引导继续），没有进入任何确认、签名、授权、助记词/私钥展示页面。',
          '创建钱包流程进入了执行边界页面。',
        );
        assertions.push({ name: 'start-use-stays-before-boundary', ...boundary });
        if (!boundary.pass) {
          throw new Error(
            '创建钱包流程疑似进入了执行边界（确认/签名/授权/密钥展示）。按安全规则立即中止，不继续点击。',
          );
        }

        await safeBack(agent, phase);
        await sleep(800);
      } else {
        console.log('[t03] 「开始使用」入口不可见，跳过该分支。');
      }

      // 阶段 A 可能通过 relaunch 回到起始态，重新确认入口可见性再进阶段 B。
      const reCheck = await agent.aiQuery<{
        loginRecoverVisible: boolean;
      }>(
        '观察当前 cowallet 界面。返回 JSON：loginRecoverVisible（是否可见「登录 / 恢复已有钱包」或等价登录/恢复入口）。',
      );
      summary.entryVisibilityAfterStartUse = reCheck;

      // 阶段 B：点「登录 / 恢复已有钱包」，只记录第一步，不提交 OTP / 助记词。
      if (reCheck.loginRecoverVisible) {
        await tapVisibleText(agent, '登录 / 恢复已有钱包');
        const phase = await inspectEntryScreen(agent, 'login-recover-flow');
        phases.push(phase);
        await captureScreen(
          agent,
          'T03 - 登录/恢复流程',
          '点「登录 / 恢复已有钱包」后到达的第一步（未提交 OTP / 助记词）。',
          [
            `Page: ${phase.screenPurpose}`,
            `Texts: ${phase.visibleTexts.join(' | ') || 'none'}`,
            `Safe back: ${phase.safeBackLabel || 'none'}`,
          ].join('\n'),
        );

        const boundary = await assertVisible(
          agent,
          '当前页面处于登录/恢复流程的起始步骤（如邮箱输入），没有进入任何确认、签名、授权或密钥展示页面。',
          '「登录/恢复」流程进入了执行边界页面。',
        );
        assertions.push({ name: 'login-recover-stays-before-boundary', ...boundary });
        if (!boundary.pass) {
          throw new Error(
            '登录/恢复流程疑似进入了执行边界（确认/签名/授权/密钥展示）。按安全规则立即中止，不继续点击。',
          );
        }

        await safeBack(agent, phase);
        await sleep(800);
      } else {
        console.log('[t03] 「登录 / 恢复已有钱包」入口不可见，跳过该分支。');
      }

      // 收尾：回到起始页，确认仍处于未登录引导态。
      await captureScreen(agent, 'T03 - 结束状态', '两个入口流程结束后回到的页面。', '见 summary。');
      const endState = await detectUserState(agent);
      summary.endState = endState;
      console.log(`[state] end ${endState.state} — ${endState.evidence}`);

      summary.phases = phases;
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
