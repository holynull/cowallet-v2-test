/**
 * T04 iOS 邮箱注册 + OTP：用 TEST_NEW_USER_EMAIL 走真实注册流程。
 *
 * 两阶段（exec 非 TTY，无法交互式输入 OTP）：
 *   --phase send    输入邮箱 → 点「继续」→ 触发验证码 → 停在 OTP 输入页退出
 *   --phase verify  输入 --otp <code> → 点验证/继续 → 观察进入的下一步
 *
 * 边界保护：
 * - 发送验证码属于 🟡 可逆注册步骤，用户已明确授权。
 * - OTP 验证通过后若进入「创建钱包 / 助记词 / 签名 / 密钥展示 / 恢复选择」，
 *   只观察到该步并记录证据，绝不继续点击进入密钥边界。
 * - 不输入任何真实钱包数据、不签名、不广播交易。
 *
 * 运行：
 *   npm run test:ios:t04:register -- --phase send
 *   npm run test:ios:t04:register -- --phase verify --otp 123456
 */

import 'dotenv/config';

import {
  APP_ID,
  createIosAgent,
  createRunContext,
  detectUserState,
  requireEnv,
  runTest,
} from './lib/cowallet.ts';
import {
  captureScreen,
  errorToString,
  launchApp,
  sleep,
  tapVisibleText,
  typeVisibleText,
} from './lib/device-kit.ts';

type StepState = {
  phase: string;
  screenPurpose: string;
  visibleTexts: string[];
  hasOtpEntry: boolean;
  hasNextBoundaryEntry: boolean;
};

/** 输入文本后收起软键盘：优先点 Done/Return/Go，失败则点输入框外区域收起。 */
async function dismissKeyboard(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<void> {
  try {
    await agent.aiTap('the keyboard Done, Return, Go, or dismiss-keyboard control', {
      deepLocate: true,
    });
    await sleep(800);
    return;
  } catch {
    // fallback：点输入框外空白处收起键盘。
  }
  try {
    const size = await agent.page.size();
    await agent.page.tap(Math.round(size.width / 2), Math.round(size.height * 0.35));
    await sleep(800);
  } catch (error) {
    console.log(`[t04] ${phase} 收起键盘失败：${errorToString(error)}`);
  }
}

const argv = process.argv.slice(2);
const getOption = (name: string): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : null;
};
const PHASE = getOption('--phase') ?? 'send';
const OTP = getOption('--otp');

/** 观察当前步骤：是否已到 OTP 输入页，或是否出现创建钱包/助记词等边界入口。 */
async function observeStep(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<StepState> {
  return agent.aiQuery<StepState>(
    [
      `观察当前 cowallet iPhone 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明这是哪个页面；',
      'visibleTexts：主要可见文案数组；',
      'hasOtpEntry：是否出现 OTP / 验证码输入框（如 6 位数字输入）；',
      'hasNextBoundaryEntry：是否出现创建钱包 / 助记词 / 恢复备份 / 签名 等下一步入口。',
      '只观察描述，不要点击、不要输入。',
    ].join('\n'),
  );
}

async function sendPhase(agent: Awaited<ReturnType<typeof createIosAgent>>['agent']): Promise<void> {
  const email = requireEnv('TEST_NEW_USER_EMAIL');

  await launchApp(agent, APP_ID.ios);
  const state = await detectUserState(agent);
  console.log(`[state] ${state.state} — ${state.evidence}`);
  if (state.state === 'wallet-ready') {
    throw new Error('设备已是 wallet-ready，不需要注册。若需重测请先登出/清到 fresh-install。');
  }

  // 进入邮箱登录/注册页（「登录 / 恢复已有钱包」或「开始创建」都会到同一邮箱页）。
  await tapVisibleText(agent, '登录 / 恢复已有钱包', 2000);
  await typeVisibleText(agent, '邮箱输入框', email, { waitMs: 1000 });
  await dismissKeyboard(agent, 'after-email-entry');
  await captureScreen(agent, 'T04 注册 - 已填邮箱', '输入测试邮箱后的登录页。', `Email: ${email}`);

  await tapVisibleText(agent, '继续', 3000);
  const afterSubmit = await observeStep(agent, 'after-email-submit');
  await captureScreen(
    agent,
    'T04 注册 - 提交邮箱后',
    '提交邮箱后的页面（可能已进入 OTP 页）。',
    [
      `Page: ${afterSubmit.screenPurpose}`,
      `Has OTP: ${afterSubmit.hasOtpEntry}`,
    ].join('\n'),
  );
  console.log(`[t04] 提交邮箱后：${afterSubmit.screenPurpose}`);

  if (!afterSubmit.hasOtpEntry) {
    throw new Error(
      `提交邮箱后未出现 OTP 输入页。可能未触发验证码或进入其它流程。页面：${afterSubmit.screenPurpose}`,
    );
  }
  console.log('[t04] 已在 OTP 输入页。请查看邮箱取验证码，然后运行：');
  console.log('  npm run test:ios:t04:register -- --phase verify --otp <code>');
}

async function verifyPhase(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<void> {
  if (!OTP) {
    throw new Error('--phase verify 需要 --otp <code>。');
  }

  // 不 relaunch，直接连上停留在 OTP 页的 App。
  const before = await observeStep(agent, 'verify-start');
  console.log(`[t04] 当前页面：${before.screenPurpose}`);

  await typeVisibleText(agent, 'OTP / 验证码输入框', OTP, { waitMs: 1000 });
  await dismissKeyboard(agent, 'after-otp-entry');
  await captureScreen(agent, 'T04 注册 - 已填 OTP', '输入验证码后的页面。', `OTP 长度：${OTP.length}（不落盘明文）`);

  // 点验证/继续。注册流程里这一步是「验证 OTP」，可逆且已授权。
  await tapVisibleText(agent, '继续', 3000);

  const after = await observeStep(agent, 'after-otp');
  await captureScreen(
    agent,
    'T04 注册 - OTP 验证后',
    'OTP 验证后的页面。',
    [
      `Page: ${after.screenPurpose}`,
      `Has OTP: ${after.hasOtpEntry}`,
      `Has next boundary: ${after.hasNextBoundaryEntry}`,
    ].join('\n'),
  );
  console.log(`[t04] OTP 验证后：${after.screenPurpose}`);

  // 边界保护：若已进入创建钱包/助记词等下一步入口，只记录，不继续点击。
  if (after.hasNextBoundaryEntry) {
    const boundary = await agent.aiQuery<{ labels: string[] }>(
      '当前页面出现了创建钱包 / 助记词 / 恢复备份 / 签名等入口。列出这些入口的可见文案 labels 数组（只观察，不点击）。',
    );
    console.log('[t04] ⚠ 检测到创建钱包/密钥相关入口，按边界规则停止，不继续点击：');
    for (const label of boundary.labels ?? []) console.log(`  - ${label}`);
    await captureScreen(
      agent,
      'T04 注册 - 停在边界前',
      'OTP 通过后进入创建钱包/密钥相关页面，脚本停在边界前。',
      `Boundary entries: ${(boundary.labels ?? []).join(' | ')}`,
    );
    throw new Error(
      `OTP 验证通过，进入创建钱包/密钥边界页（${(boundary.labels ?? []).join('、')}）。按安全规则停止。`,
    );
  }
}

async function main(): Promise<number> {
  const label = PHASE === 'send' ? 't04-register-send' : 't04-register-verify';
  const ctx = await createRunContext(label);
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    phase: PHASE,
    startedAt: new Date().toISOString(),
    status: 'running',
  };

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;
    try {
      if (PHASE === 'send') {
        await sendPhase(agent);
        summary.status = 'waiting-for-otp';
      } else if (PHASE === 'verify') {
        await verifyPhase(agent);
        summary.status = 'passed';
      } else {
        throw new Error(`未知 --phase：${PHASE}（可选 send / verify）`);
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
