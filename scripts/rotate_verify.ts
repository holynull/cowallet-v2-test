/**
 * 真实执行密钥轮换验证（issue 3）——用户已显式授权「真实验证一次换钥匙」。
 *
 * ⚠️ 不可逆操作：换钥匙后旧 24 词/旧备份作废、生成新 24 词。仅当用户当次授权时运行。
 * 安全设计：
 *  - 恢复密码只从 .env TEST_WALLET_PASSWORD 读取，经 typeOnly 输入，绝不落日志/截图；
 *  - 新助记词展示屏**不截图**；aiQuery 只返回页面结构（标题/按钮），不提取任何单词；
 *  - Face ID 两次均由真人手动完成；脚本不程序化触发生物识别。
 *
 * 用法（分步驱动，每步独立连接 WDA）：
 *   npx tsx scripts/rotate_verify.ts --step start         # 在「换一套新钥匙」页点「开始换钥匙」
 *   npx tsx scripts/rotate_verify.ts --step password      # 输入恢复密码（从 .env）
 *   npx tsx scripts/rotate_verify.ts --step observe       # 只读观察当前页（不截图敏感屏）
 *   npx tsx scripts/rotate_verify.ts --step retry         # 失败屏点「再试一次」，继续换钥匙流程
 *   npx tsx scripts/rotate_verify.ts --step verify        # 等待并核对换钥匙完成结果
 */

import 'dotenv/config';

import { createIosAgent, createRunContext, requireEnv } from './lib/cowallet.ts';
import { sleep } from './lib/device-kit.ts';

const argv = process.argv.slice(2);
const stepIdx = argv.indexOf('--step');
const STEP = stepIdx >= 0 ? argv[stepIdx + 1] : 'observe';

type PageState = {
  screenPurpose: string;
  hasStartButton: boolean;
  hasBackOutButton: boolean;
  hasRetryButton: boolean;
  isFailed: boolean;
  hasPasswordInput: boolean;
  hasFaceIdPrompt: boolean;
  showsMnemonic: boolean;
  isWaiting: boolean;
  isDone: boolean;
  visibleHints: string[];
};

async function observe(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
  phase: string,
): Promise<PageState> {
  return agent.aiQuery<PageState>(
    [
      `观察当前 cowallet 界面（阶段：${phase}）。返回 JSON：`,
      'screenPurpose：一句话说明当前页面用途；',
      'hasStartButton：是否有「开始换钥匙」按钮；hasBackOutButton：是否有「先不换」；',
      'hasRetryButton：是否有「再试一次」；isFailed：是否显示换钥匙失败/未换成 等失败态；',
      'hasPasswordInput：是否有恢复密码/助记词输入框；',
      'hasFaceIdPrompt：是否有 Face ID / 生物识别 / 双击侧边按钮 确认提示；',
      'showsMnemonic：是否在展示一组新的助记词/备份词（**只回答 true/false，不要复述任何单词**）；',
      'isWaiting：是否显示「正在准备/处理/等待服务器/需要几分钟」等进度状态；',
      'isDone：是否显示换钥匙成功/完成/新钥匙已生效 等完成态；',
      'visibleHints：除助记词外的关键提示文案（按钮、标题、状态，**严禁包含任何助记词/单词**）。',
      '只观察描述，不要点击任何按钮。',
    ].join('\n'),
  );
}

async function run(step: string): Promise<void> {
  const ctx = await createRunContext(`rotate-verify-${step}`);
  const { agent } = await createIosAgent(ctx);
  try {
    if (step === 'start') {
      const s = await observe(agent, 'start');
      console.log('[start] 当前：', s.screenPurpose, '| 有开始按钮=', s.hasStartButton);
      if (!s.hasStartButton) throw new Error('未在「换一套新钥匙」页（无「开始换钥匙」按钮）');
      console.log('[start] 点击「开始换钥匙」…');
      await agent.aiTap('the "开始换钥匙" primary button', { deepLocate: true });
      await sleep(3000);
      const after = await observe(agent, 'after-start');
      console.log('[start] 点击后：', after.screenPurpose);
      console.log('[start] 有密码输入框=', after.hasPasswordInput, '| 有FaceID提示=', after.hasFaceIdPrompt, '| hints=', JSON.stringify(after.visibleHints));
      return;
    }

    if (step === 'password') {
      const s = await observe(agent, 'password');
      console.log('[password] 当前：', s.screenPurpose, '| 有密码输入框=', s.hasPasswordInput);
      if (s.hasFaceIdPrompt) {
        console.log('[password] 已出现 Face ID 提示，请真人完成确认（脚本不触发）。');
        return;
      }
      if (!s.hasPasswordInput) throw new Error('未出现密码输入框');
      const pw = requireEnv('TEST_WALLET_PASSWORD'); // 不回显
      await agent.aiTap('the recovery password / mnemonic input field', { deepLocate: true });
      await sleep(800);
      await agent.aiInput('the recovery password / mnemonic input field', { value: pw, mode: 'typeOnly', deepLocate: true });
      await sleep(500);
      // 点击“继续/确认/下一步”等提交（白名单；不含作废/删除等执行词）
      const after = await observe(agent, 'before-submit');
      console.log('[password] 已输入密码（不回显），hints=', JSON.stringify(after.visibleHints));
      await agent.aiTap('the confirm/submit/next button near the password input', { deepLocate: true });
      await sleep(3500);
      const after2 = await observe(agent, 'after-submit');
      console.log('[password] 提交后：', after2.screenPurpose, '| FaceID=', after2.hasFaceIdPrompt, '| waiting=', after2.isWaiting, '| hints=', JSON.stringify(after2.visibleHints));
      return;
    }

    if (step === 'observe') {
      const s = await observe(agent, 'observe');
      console.log('[observe]', JSON.stringify(s, null, 2));
      return;
    }

    if (step === 'retry') {
      const s = await observe(agent, 'retry');
      console.log('[retry] 当前：', s.screenPurpose, '| 失败态=', s.isFailed, '| 有重试按钮=', s.hasRetryButton);
      if (!s.isFailed || !s.hasRetryButton) throw new Error('当前不在换钥匙失败屏（无「再试一次」）');
      console.log('[retry] 点击「再试一次」…');
      await agent.aiTap('the "再试一次" (retry) button', { deepLocate: true });
      await sleep(3500);
      const after = await observe(agent, 'after-retry');
      console.log('[retry] 点击后：', after.screenPurpose);
      console.log('[retry] 有密码输入框=', after.hasPasswordInput, '| FaceID=', after.hasFaceIdPrompt, '| waiting=', after.isWaiting, '| hints=', JSON.stringify(after.visibleHints));
      return;
    }

    if (step === 'verify') {
      // 轮询直到完成态（最多 4 分钟）
      const deadline = Date.now() + 4 * 60_000;
      let s: PageState | null = null;
      while (Date.now() < deadline) {
        s = await observe(agent, 'verify');
        console.log('[verify]', s.screenPurpose, '| done=', s.isDone, '| waiting=', s.isWaiting, '| mnemonic=', s.showsMnemonic);
        if (s.isDone) break;
        if (!s.isWaiting && !s.showsMnemonic && !s.hasFaceIdPrompt) break; // 既非进行中也非完成
        await sleep(8000);
      }
      console.log('[verify] 结果：', JSON.stringify(s));
      return;
    }

    throw new Error(`未知 step: ${step}`);
  } finally {
    try {
      await agent.destroy();
    } catch {
      /* ignore */
    }
  }
}

await run(STEP).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
