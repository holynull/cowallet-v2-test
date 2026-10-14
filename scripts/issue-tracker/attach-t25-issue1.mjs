#!/usr/bin/env node
/**
 * T25（issue 1 跨端确认：收款到账通知）证据归档。
 *
 * 结论：真实入账（0.002 ETH）在首页右上角触发铃铛红色角标“1”，通知中心出现
 * 「收到钱了 — 收到 0.002 ETH（Ethereum）· 0xabfc…f8b4」。即 App 存在站内
 * 收款通知，与 issue 1 原文「收款没有任何消息提示」相反（原文证据为入账后过
 * 一段时间才查看，未发现角标）。本用例以同日 14:07 无角标 / 14:14 有角标“1”
 * 的前后对照佐证。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t25-issue1.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t25-issue1.mjs --apply
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';

const SHOTS = [
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue1-crossend', 't25-issue1-home-3.70-baseline.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue1-crossend', 't25-issue1-home-8.70-bell-badge.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue1-crossend', 't25-issue1-notification-center-shoudaoqian.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue1-crossend', 'compare-1407-topright-no-badge.jpg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue1-crossend', 'compare-1414-topright-badge-1.jpg'),
];

const REGRESSION_NOTE =
  '【2026-10-14 issue 1 跨端确认（真实入账，0.002 ETH / Ethereum）】' +
  '外部地址 0xabfc…f8b4 向钱包 0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821 转入 0.002 ETH：' +
  '首页右上角出现铃铛图标红色未读角标“1”，打开后通知中心显示「收到钱了 — 收到 0.002 ETH（Ethereum）· 收款 · Ethereum · 0xabfc…f8b4 · 2分钟前」。' +
  '同日前后对照：14:07（余额 $3.70）右上角无角标，14:14（余额 $8.70，入账后）出现角标“1”。' +
  '结论：App **存在站内收款通知**（铃铛角标 + 通知中心），与 issue 1 原文「收款没有任何消息提示」相反；' +
  '原文证据为入账后隔一段时间才查看首页/钱包，未发现角标，疑为漏看或通知生成时机问题。' +
  '补充：本次未观察到锁屏/横幅类 PUSH 推送（观察窗口内 App 处于前台），PUSH 通知是否存在需另行确认；' +
  '设置页也没有通知偏好设置项。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 1（reczz28MNNXaNcQw）← 追加 ${SHOTS.length} 张跨端确认截图 + 回归备注`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '1');
  if (!rec) {
    console.warn('  ! 找不到序号 1，跳过');
    return;
  }
  const uploaded = [];
  for (const file of SHOTS) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  const existing = rec.fields.APP截图 ?? [];
  const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
  await client.updateRecord(APP_TOKEN, TABLE_ID, rec.record_id, {
    回归备注: REGRESSION_NOTE,
    APP截图: merged,
  });
  console.log(`  ✓ issue 1 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归备注已更新`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
