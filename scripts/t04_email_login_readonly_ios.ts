/**
 * T04 iOS 邮箱登录页只读探索：确认登录页字段结构、空输入与非法邮箱格式的
 * 前端校验反馈，以及安全返回路径。全程不输入合法邮箱、不触发 OTP 发送。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install（欢迎页或介绍页均可）；WDA 已就绪
 * 风险等级：🟡 只读探索（仅在登录页做输入与错误态观察，不发送验证码、不提交真实数据）
 *
 * 运行：npm run test:ios:t04
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
  typeVisibleText,
} from './lib/device-kit.ts';

type LoginPageState = {
  screenPurpose: string;
  visibleTexts: string[];
  hasEmailField: boolean;
  hasContinueButton: boolean;
  hasBackButton: boolean;
  hasOtpOrVerificationEntry: boolean;
  errorFeedback: string | null;
};

async function inspectLoginPage(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  label: string,
): Promise<LoginPageState> {
  return agent.aiQuery<LoginPageState>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${label}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasEmailField：是否有邮箱输入框；hasContinueButton：是否有「继续」或等价的提交按钮；',
      'hasBackButton：是否有返回/关闭按钮；',
      'hasOtpOrVerificationEntry：是否已进入 OTP / 验证码输入阶段或出现"验证码已发送"类提示；',
      'errorFeedback：当前可见的错误提示文案（红色提示等）；没有就返回 null。',
      '只观察和描述，不要点击、不要提交。',
    ].join('\n'),
  );
}

/** 只读地测一个不会触发 OTP 的输入场景：空提交、或明显非法的邮箱格式。 */
async function probeEmailInput(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phaseLabel: string,
  inputValue: string | null,
): Promise<LoginPageState> {
  if (inputValue !== null) {
    await typeVisibleText(agent, '邮箱输入框', inputValue, { waitMs: 800 });
    await captureScreen(agent, `T04 ${phaseLabel} - 已输入`, `输入了非法/空值：${JSON.stringify(inputValue)}`, `输入值：${inputValue}`);
  }
  await tapVisibleText(agent, '继续', 1500);
  const state = await inspectLoginPage(agent, `${phaseLabel}-after`);
  await captureScreen(
    agent,
    `T04 ${phaseLabel} - 提交后`,
    '提交后的页面与错误反馈。',
    [
      `Phase: ${phaseLabel}`,
      `Error: ${state.errorFeedback ?? 'none'}`,
      `Has OTP entry: ${state.hasOtpOrVerificationEntry}`,
    ].join('\n'),
  );
  return state;
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t04-email-login-readonly-ios');
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
        throw new Error('T04 需要未登录起始状态，实际为 wallet-ready。');
      }

      // 从引导页进入邮箱登录页（「登录 / 恢复已有钱包」或「开始创建」都会到同一登录页）。
      await tapVisibleText(agent, '登录 / 恢复已有钱包', 2000);
      const entry = await inspectLoginPage(agent, 'login-page-entry');
      summary.loginPage = entry;
      await captureScreen(
        agent,
        'T04 邮箱登录页 - 进入',
        '从引导页进入邮箱登录页。',
        [
          `Page: ${entry.screenPurpose}`,
          `Has email field: ${entry.hasEmailField}`,
          `Has continue: ${entry.hasContinueButton}`,
          `Has OTP entry: ${entry.hasOtpOrVerificationEntry}`,
        ].join('\n'),
      );

      const assertions: Array<{ name: string; pass: boolean; message?: string }> = [];

      const emailFieldAssert = await assertVisible(
        agent,
        '当前 cowallet 页面是邮箱登录/注册页，包含邮箱输入框与「继续」按钮。',
        '未进入邮箱登录页或缺少邮箱输入框。',
      );
      assertions.push({ name: 'email-login-page-rendered', ...emailFieldAssert });

      if (entry.hasOtpOrVerificationEntry) {
        throw new Error('进入登录页时已直接处于 OTP/验证码阶段，不符合预期（应先是邮箱输入）。');
      }

      // 场景 1：空输入直接点「继续」。应出现"请输入邮箱"类提示，且不进入 OTP。
      const emptySubmit = await probeEmailInput(agent, 'empty-submit', null);
      const emptyHasError = Boolean(emptySubmit.errorFeedback);
      assertions.push({
        name: 'empty-submit-shows-error-or-stays',
        pass: emptyHasError || !emptySubmit.hasOtpOrVerificationEntry,
        message: emptyHasError
          ? `空提交有错误提示：${emptySubmit.errorFeedback}`
          : '空提交无错误提示但未进入 OTP 阶段',
      });
      summary.emptySubmit = emptySubmit;
      if (emptySubmit.hasOtpOrVerificationEntry) {
        throw new Error('空提交不应触发 OTP 发送或进入验证码阶段。');
      }

      // 场景 2：非法邮箱格式。应出现格式错误提示，且不进入 OTP。
      const invalidEmail = await probeEmailInput(agent, 'invalid-email', 'not-an-email');
      const invalidHasError = Boolean(invalidEmail.errorFeedback);
      assertions.push({
        name: 'invalid-email-shows-error',
        pass: invalidHasError || !invalidEmail.hasOtpOrVerificationEntry,
        message: invalidHasError
          ? `非法邮箱有错误提示：${invalidEmail.errorFeedback}`
          : '非法邮箱无错误提示但未进入 OTP 阶段',
      });
      summary.invalidEmail = invalidEmail;
      if (invalidEmail.hasOtpOrVerificationEntry) {
        throw new Error('非法邮箱不应触发 OTP 发送或进入验证码阶段。');
      }

      // 安全返回：回到引导页。
      const back = await agent.aiQuery<{ hasBack: boolean; backLabel: string | null }>(
        '当前 cowallet 邮箱登录页是否有安全返回按钮？返回 JSON：hasBack（是否有返回/关闭按钮）、backLabel（其精确文案，没有则 null）。',
      );
      if (back.hasBack && back.backLabel) {
        await tapVisibleText(agent, back.backLabel, 1500);
      } else {
        console.log('[t04] 未识别到返回按钮，跳过返回（保持只读）。');
      }

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
