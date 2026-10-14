/**
 * 与产品无关的 Midscene 设备动作原语。
 *
 * 这里只放“怎么操作设备”，不放 cowallet 的页面、账号状态、资金安全规则；
 * 那些属于 scripts/lib/cowallet.ts。
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AndroidAgent } from '@midscene/android';
import type { IOSAgent } from '@midscene/ios';

/** Android / iOS agent 的公共能力子集。 */
export type MobileAgent = AndroidAgent | IOSAgent;

export type Platform = 'android' | 'ios';

export type ReportScreenshot = {
  base64: string;
  description: string;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorToString(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}

export async function writeRunSummary(
  runDir: string,
  summary: Record<string, unknown>,
): Promise<string> {
  const summaryPath = path.join(runDir, 'summary.json');
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summaryPath;
}

/** 把 App 拉到前台并等待首屏渲染。 */
export async function launchApp(agent: MobileAgent, appId: string, waitMs = 3500): Promise<void> {
  console.log(`[app] launching ${appId}`);
  await agent.launch(appId);
  await sleep(waitMs);
}

/** 截一张图并写进 Midscene 报告，作为可复核证据。 */
export async function captureScreen(
  agent: MobileAgent,
  title: string,
  description: string,
  content: string,
): Promise<void> {
  const screenshot = await agent.page.screenshotBase64();
  await agent.recordToReport(title, {
    content,
    screenshots: [{ base64: screenshot, description }],
  });
}

/** 通过语义提问读取当前可见状态；可选把结果写进报告。 */
export async function queryVisibleState<T>(
  agent: MobileAgent,
  prompt: string,
  reportTitle?: string,
): Promise<T> {
  const state = await agent.aiQuery<T>(prompt);
  if (reportTitle) {
    await agent.recordToReport(reportTitle, { content: JSON.stringify(state, null, 2) });
  }
  return state;
}

/** 断言一句可观察的界面事实，返回统一的 { pass, message, thought }。 */
export async function assertVisible(
  agent: MobileAgent,
  statement: string,
  errorMessage: string,
): Promise<{ pass: boolean; message: string | undefined; thought: string | undefined }> {
  const result = await agent.aiAssert(statement, errorMessage);
  return {
    pass: result?.pass ?? true,
    message: result?.message,
    thought: result?.thought,
  };
}

/** 按可见文案点按（deepLocate 让模型在密集页面里更稳）。 */
export async function tapVisibleText(
  agent: MobileAgent,
  label: string,
  waitMs = 1200,
): Promise<void> {
  await agent.aiTap(label, { deepLocate: true });
  await sleep(waitMs);
}

/** 往可见输入框里输入文本。默认 replace，避免残留上一次的内容。 */
export async function typeVisibleText(
  agent: MobileAgent,
  fieldPrompt: string,
  value: string,
  options?: {
    waitMs?: number;
    deepLocate?: boolean;
    autoDismissKeyboard?: boolean;
    mode?: 'replace' | 'clear' | 'typeOnly' | 'append';
  },
): Promise<void> {
  await agent.aiInput(fieldPrompt, {
    value,
    deepLocate: options?.deepLocate ?? true,
    autoDismissKeyboard: options?.autoDismissKeyboard ?? false,
    mode: options?.mode ?? 'replace',
  });
  await sleep(options?.waitMs ?? 500);
}
