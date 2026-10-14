#!/usr/bin/env node
/**
 * issue 1 处置：跨端确认后判定「已澄清/未复现」→ 回归验证状态设为 已验收，
 * 追加处置备注；PUSH 推送缺失单列 issue 16（由 MCP 创建）。
 *
 * 用法：
 *   node scripts/issue-tracker/dispose-issue1.mjs              # dry-run
 *   node scripts/issue-tracker/dispose-issue1.mjs --apply
 */

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const DISPOSITION =
  '【2026-10-14 处置】跨端确认（0.002 ETH 真实入账）证实 App **存在站内收款通知**（首页铃铛角标“1” + 通知中心「收到钱了」），' +
  'issue 1 原文「收款没有任何消息提示」**未复现**，判定为「已澄清/未复现」。' +
  '剩余缺口：未观察到 PUSH/锁屏推送，单列 issue 16 待确认。';

async function main() {
  if (!APPLY) {
    console.log('issue 1（reczz28MNNXaNcQw）：回归验证状态 → 已验收，追加处置备注（dry-run，加 --apply 生效）。');
    return;
  }
  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '1');
  if (!rec) {
    console.warn('  ! 找不到序号 1');
    return;
  }
  const prev = typeof rec.fields.回归备注 === 'string' ? rec.fields.回归备注 : (rec.fields.回归备注 ?? []).map((t) => (typeof t === 'string' ? t : t.text)).join('');
  await client.updateRecord(APP_TOKEN, TABLE_ID, rec.record_id, {
    回归验证状态: '已验收',
    回归备注: `${prev}\n\n${DISPOSITION}`,
  });
  console.log('  ✓ issue 1 → 已验收，处置备注已追加');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
