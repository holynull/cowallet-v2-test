#!/usr/bin/env node
/**
 * 密钥轮换回归（issue 3）+ 新增 issue 15（AI 提供选项但返回 not_applicable）。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue3-15.mjs              # dry-run
 *   node scripts/issue-tracker/attach-issue3-15.mjs --apply
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';
const EVIDENCE = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue15', 'secure-this-phone-not-applicable.jpg');

const ISSUE3_NOTE =
  '【2026-10-14 回归（只读）】v2 已重构密钥轮换：AI 明确回答「CoWallet 没有单独的『轮换密钥』按钮——' +
  '三份钥匙换新只发生在恢复钱包的时候」，设置页（密钥检查/风险防护等）也无显式轮换入口。' +
  '选择 AI 提供的「旧手机被人碰过，想保护这台手机」后，返回「无法生成计划 · secure_this_phone does not apply ' +
  'to this wallet right now · 详情: not_applicable · 换个说法再试一次」，未出现执行/确认/签名边界。' +
  '结论：不是崩溃式失败，而是动作被状态门槛（not_applicable）拒绝；是否产品预期需确认（当前三份均第 1 代，' +
  '无旧分片可作废）。';

const ISSUE15_FIELDS = {
  序号: '15',
  Issue: 'AI 提供「旧手机被人碰过，想保护这台手机/让旧钥匙作废」选项，选择后返回「无法生成计划（not_applicable）」且无原因与替代路径',
  问题类型: '功能问题',
  平台: 'iOS',
  严重程度: '中',
  文档标注状态: '未标注',
  问题归类: '产品缺陷',
  Issue备注:
    '真机观察（app.getcowallet.wallet v1.0.2 build 2610121802，iOS 真机只读回归）：AI 对「我想轮换钱包密钥，' +
    '应该在哪里操作？」先给出可点澄清选项「旧手机被人碰过，想保护这台手机」（及「只想做一次安全体检」），' +
    '用户选择后 AI 复述意图「旧手机可能被别人碰过，我想保护现在这台手机 / 让旧的那份作废」，随后返回' +
    '「无法生成计划 / 没法生成这个计划 / secure_this_phone does not apply to this wallet right now / ' +
    '详情: not_applicable / 换个说法再试一次」，无原因说明、无替代路径，用户被导向「换个说法再试一次」。\n' +
    '来源：midscene_run/report/probe-rotate-ai2.html、probe-rotate-protect.html、probe-rotate-ai-next.html。\n' +
    '发现版本：v2（TestFlight 构建 2610121802）\n' +
    '来源：iOS 真机只读回归',
  影响:
    '中。安全敏感场景下，App 提供看似可用的安全动作，选择后进入无法解释的死胡同（仅提示 not_applicable + 换个说法），' +
    '对用户理解与信任有负面影响。期望：不适用时不提供该选项，或给出原因与可行替代路径（如「当前无旧设备分片需作废；' +
    '如需换新请走恢复钱包流程」）。',
  反馈状态: '待反馈',
  回归验证状态: '待确认',
};

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 3（reczz28MNNXaNbKw）← 追加 1 张回归截图 + 回归备注`);
  console.log(`  新增 issue 15 ← 附 1 张截图`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);

  const rec3 = records.find((r) => flattenText(r.fields.序号) === '3');
  if (rec3) {
    const token = await client.uploadMedia(APP_TOKEN, EVIDENCE);
    const existing = rec3.fields.APP截图 ?? [];
    const merged = [...existing.map(({ file_token }) => ({ file_token })), { file_token: token }];
    await client.updateRecord(APP_TOKEN, TABLE_ID, rec3.record_id, {
      回归备注: ISSUE3_NOTE,
      回归验证状态: '部分通过',
      APP截图: merged,
    });
    console.log(`  ✓ 序号 3 追加 1 张（当前 ${merged.length} 张），回归状态→部分通过`);
  } else {
    console.warn('  ! 找不到序号 3，跳过');
  }

  const dup = records.find((r) => flattenText(r.fields.序号) === '15');
  if (dup) {
    console.warn('  ! 序号 15 已存在，跳过创建');
  } else {
    const token = await client.uploadMedia(APP_TOKEN, EVIDENCE);
    await client.batchCreate(APP_TOKEN, TABLE_ID, [{ ...ISSUE15_FIELDS, APP截图: [{ file_token: token }] }]);
    console.log('  ✓ 新增序号 15（附 1 张截图）');
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
