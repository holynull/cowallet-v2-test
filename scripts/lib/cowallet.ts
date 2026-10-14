/**
 * cowallet 专属适配层：设备选择、run 目录、agent 创建、用户状态模型、安全边界。
 *
 * 约定（沿用 ../cowallet/blackbox-device-tests 的既有实践）：
 * - 设备必须显式固定：Android 用 ANDROID_DEVICE_ID，iOS 用 IOS_UDID。
 * - 每次运行把报告写到 reports/<timestamp>-<label>/，midscene_run/ 只作为兜底缓存。
 * - 只读探索默认允许；转账、签名、approve、导出助记词/私钥、删号、冻结等不可逆动作
 *   必须停在确认边界之前，除非当次任务明确授权。
 */

import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentFromAdbDevice, getConnectedDevicesWithDetails, type AndroidAgent } from '@midscene/android';
import { agentFromWebDriverAgent, type IOSAgent } from '@midscene/ios';

import { sleep, type MobileAgent, type Platform } from './device-kit.ts';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPORTS_DIR = path.join(ROOT_DIR, 'reports');

export const APP_ID: Record<Platform, string> = {
  android: process.env.ANDROID_BUNDLE_ID || 'com.cowallet.app',
  ios: process.env.IOS_BUNDLE_ID || 'com.cowallet.app',
};

/** 需要用户显式授权才能跨过的动作边界。 */
export const EXECUTION_BOUNDARY = [
  '真实转账',
  '兑换/swap 提交',
  '代币授权(approve)',
  '签名/广播交易',
  '导出或查看助记词、私钥、key shard',
  '删除账号',
  '紧急冻结等不可逆安全状态变更',
];

/** 注入到 aiAct 的上下文，让模型不要自己越过执行边界。 */
export const SAFETY_CONTEXT = [
  'You are black-box testing the cowallet mobile crypto wallet app on a real device.',
  `Never perform these irreversible actions: ${EXECUTION_BOUNDARY.join('、')}.`,
  'Stop and record evidence immediately before any confirmation, signing, approval, secret-reveal or deletion screen.',
  'Never type real mnemonics, private keys, passwords or other secrets; only use values provided via environment variables by the test runner.',
  'Prefer observing and asserting visible UI state over guessing internal wallet state.',
].join('\n');

/** cowallet 的三个关键用户状态，测试前必须先确认。 */
export const USER_STATE_MODEL = [
  'fresh-install: 未注册未登录，App 只提供注册/登录/恢复入口',
  'email-registered-no-wallet: 身份已存在但没有可用钱包，需要创建或恢复',
  'wallet-ready: 已有可用钱包，资产、AI 会话、转账入口可见',
].join('\n');

export type RunContext = {
  runName: string;
  runDir: string;
};

export type WalletUserState = {
  state: 'fresh-install' | 'email-registered-no-wallet' | 'wallet-ready' | 'unknown';
  evidence: string;
  visibleTexts: string[];
  hasAiChatEntry: boolean;
  hasWalletHome: boolean;
  language: string;
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`环境变量 ${name} 未设置。请在仓库根目录的 .env 中补齐（参考 .env.example）。`);
  }
  return value;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function createRunContext(label: string): Promise<RunContext> {
  const runName = `${timestamp()}-${label}`;
  const runDir = path.join(REPORTS_DIR, runName);
  await mkdir(runDir, { recursive: true });
  process.env.MIDSCENE_RUN_DIR = runDir;
  process.env.MIDSCENE_REPORT_TAG_NAME = process.env.MIDSCENE_REPORT_TAG_NAME || runName;
  return { runName, runDir };
}

/**
 * 解析目标安卓设备：显式 pin 优先；未 pin 时只接受唯一一台设备。
 * 设备不唯一时直接失败，避免静默选错机器。
 */
export async function resolveAndroidDeviceId(): Promise<string> {
  const pinned = process.env.ANDROID_DEVICE_ID || process.env.ANDROID_SERIAL;
  if (pinned) return pinned;

  const devices = await getConnectedDevicesWithDetails();
  if (devices.length === 0) {
    throw new Error('没有检测到安卓设备。请连接真机、开启 USB 调试并授权后再执行。');
  }
  if (devices.length > 1) {
    const ids = devices.map((device) => device.udid).join(', ');
    throw new Error(`检测到多台安卓设备，请在 .env 里固定 ANDROID_DEVICE_ID。当前：${ids}`);
  }
  const device = devices[0];
  if (!device?.udid) {
    throw new Error('无法解析安卓设备 serial，请在 .env 里显式设置 ANDROID_DEVICE_ID。');
  }
  console.log(`[device] 未固定 ANDROID_DEVICE_ID，自动选定唯一设备 ${device.udid}`);
  return device.udid;
}

export async function createAndroidAgent(ctx: RunContext): Promise<{ agent: AndroidAgent; deviceId: string }> {
  const deviceId = await resolveAndroidDeviceId();
  const agent = await agentFromAdbDevice(deviceId, {
    reportFileName: ctx.runName,
    testId: 'cowallet-v2-android',
    autoDismissKeyboard: false,
    aiActContext: SAFETY_CONTEXT,
  });
  return { agent, deviceId };
}

function wdaStatusUrl(): string {
  const explicit = process.env.WDA_STATUS_URL;
  if (explicit) return explicit;
  const host = process.env.WDA_HOST || '127.0.0.1';
  const port = process.env.IOS_WDA_LOCAL_PORT || '8100';
  return `http://${host}:${port}/status`;
}

async function isWdaReady(): Promise<boolean> {
  try {
    const response = await fetch(wdaStatusUrl(), { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const body = (await response.json()) as {
      ready?: boolean;
      value?: { ready?: boolean; state?: string };
    };
    return Boolean(body?.ready === true || body?.value?.ready === true || body?.value?.state === 'success');
  } catch {
    return false;
  }
}

/**
 * WDA 当作长驻服务：已经就绪就复用，不重复构建。
 * 未就绪时，只有 WDA_AUTOSTART 不为 false 才自动启动（会触发编译与签名）。
 */
export async function ensureWdaReady(ctx: RunContext): Promise<void> {
  if (await isWdaReady()) {
    console.log(`[wda] 复用已就绪的 WDA：${wdaStatusUrl()}`);
    return;
  }

  if (process.env.WDA_AUTOSTART === 'false') {
    throw new Error(
      `WDA 未就绪（${wdaStatusUrl()}），且 WDA_AUTOSTART=false。请先执行 npm run wda:start。`,
    );
  }

  console.log('[wda] 未就绪，自动执行 npm run wda:start（会编译并签名 WebDriverAgent）');
  const logPath = path.join(ctx.runDir, 'wda-start.log');
  // 用 openSync 拿真实 fd 传给 stdio。不要传 createWriteStream 的实例：
  // 文件打开完成前它的 fd 是 null，spawn 会抛 "argument 'stdio' is invalid"。
  const logFd = openSync(logPath, 'a');
  const child = spawn('./scripts/device/start-wda.sh', {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();

  const timeoutSeconds = Number(process.env.WDA_READY_TIMEOUT_SECONDS || 180);
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    if (await isWdaReady()) {
      console.log(`[wda] 已就绪：${wdaStatusUrl()}`);
      return;
    }
    await sleep(2000);
  }
  throw new Error(`WDA 在 ${timeoutSeconds}s 内未就绪，启动日志：${logPath}`);
}

export async function createIosAgent(ctx: RunContext): Promise<{ agent: IOSAgent; deviceId: string }> {
  const deviceId = requireEnv('IOS_UDID');
  await ensureWdaReady(ctx);
  const agent = await agentFromWebDriverAgent({
    deviceId,
    wdaHost: process.env.WDA_HOST || '127.0.0.1',
    wdaPort: Number(process.env.IOS_WDA_LOCAL_PORT || 8100),
    reportFileName: ctx.runName,
    testId: 'cowallet-v2-ios',
    autoDismissKeyboard: false,
    aiActContext: SAFETY_CONTEXT,
  });
  return { agent, deviceId };
}

export async function createAgentFor(
  platform: Platform,
  ctx: RunContext,
): Promise<{ agent: MobileAgent; deviceId: string }> {
  return platform === 'android' ? createAndroidAgent(ctx) : createIosAgent(ctx);
}

/** 读取当前用户状态，作为用例前置条件。只读，不点击任何高风险入口。 */
export async function detectUserState(agent: MobileAgent): Promise<WalletUserState> {
  return agent.aiQuery<WalletUserState>(
    [
      '观察当前 cowallet 界面，判断用户状态。返回 JSON：',
      'state：只能是 fresh-install、email-registered-no-wallet、wallet-ready、unknown 之一；',
      'evidence：一句话说明判断依据；visibleTexts：主要可见文案数组；',
      'hasAiChatEntry：是否能看到 AI 对话入口；hasWalletHome：是否能看到资产/余额首页；',
      'language：界面主要语言（zh 或 en）。',
      '用户状态定义：',
      USER_STATE_MODEL,
    ].join('\n'),
  );
}

/** 断言 App 真的渲染出了界面，而不是白屏或闪退残留。 */
export async function assertAppUiRendered(
  agent: MobileAgent,
  platform: Platform,
): Promise<{ pass: boolean; message: string | undefined; thought: string | undefined }> {
  const target = platform === 'ios' ? 'iPhone 屏幕' : '安卓屏幕';
  const result = await agent.aiAssert(
    `${target}上显示的是 cowallet 应用界面，有可见文案或控件，不是空白页、系统桌面或崩溃弹窗。`,
    'cowallet 首屏没有渲染出可见界面内容。',
  );
  return {
    pass: result?.pass ?? true,
    message: result?.message,
    thought: result?.thought,
  };
}

/**
 * 统一的 main 包装：出错时也写出 summary.json，保证失败可追溯。
 * 返回进程码，由脚本自行 process.exit。
 */
export async function runTest(
  ctx: RunContext,
  summary: Record<string, unknown>,
  body: () => Promise<void>,
): Promise<number> {
  const { writeRunSummary } = await import('./device-kit.ts');
  try {
    await body();
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    summary.status = 'error';
    summary.error = message;
    const summaryPath = await writeRunSummary(ctx.runDir, summary);
    console.error(`[fail] ${message}`);
    console.error(`[result] summary: ${summaryPath}`);
    return 1;
  }

  const summaryPath = await writeRunSummary(ctx.runDir, summary);
  console.log(`[result] summary: ${summaryPath}`);
  if (typeof summary.midsceneReport === 'string') {
    console.log(`[result] midscene report: ${summary.midsceneReport}`);
  }
  return summary.status === 'passed' ? 0 : 1;
}

export function newRunId(): string {
  return randomUUID().slice(0, 8);
}
