/**
 * 临时探针：连接 iOS 真机，截图并描述当前页面。
 * 用法：npx tsx scripts/probe_state.ts
 * 可用于验证 Midscene 配置的视觉模型在真实截图上的结构化输出。
 */

import 'dotenv/config';

import { createIosAgent, createRunContext } from './lib/cowallet.ts';
import { captureScreen } from './lib/device-kit.ts';

const ctx = await createRunContext('probe-state');
const { agent } = await createIosAgent(ctx);
try {
  await captureScreen(agent, 'probe-current-state', 'probe-state 截屏', 'probe-state 观察');
  const state = await agent.aiQuery<{
    screenPurpose: string;
    isHome: boolean;
    isSettings: boolean;
    visibleTexts: string[];
    hasBottomTabs: boolean;
    bottomTabLabels: string[];
  }>(
    [
      '观察当前 cowallet iOS 界面，返回 JSON：',
      'screenPurpose：一句话说明当前页面用途；',
      'isHome：是否是首页（总资产/钱包概览/底部导航可见）；isSettings：是否在设置页；',
      'visibleTexts：主要可见文案数组（前 20 条）；',
      'hasBottomTabs：是否有底部导航 tab；bottomTabLabels：底部 tab 文案数组。',
      '只观察，不点击。',
    ].join('\n'),
  );
  console.log(JSON.stringify(state, null, 2));
} finally {
  await agent.destroy().catch((error: unknown) => {
    console.error(`[warn] agent.destroy 失败：${String(error)}`);
  });
}
