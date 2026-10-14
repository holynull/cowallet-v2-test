#!/usr/bin/env node
/**
 * Issue 3（轮换密钥失败）结论纠错归档。
 *
 * 背景：此前 T25 只读回归结论「v2 无独立轮换入口，轮换=恢复」有误。
 * 2026-10-14 用户手动导航至 设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」，
 * 探针 `_probe_rotate_capture.mjs` 只读观察（未点任何执行按钮）：
 *   - 轮换页标题「换一套新钥匙」：手机/服务器/备份三份全部换新，钱包地址不变，
 *     换后给一组新的 24 个助记词，旧的 24 词与旧备份作废；
 *   - 警示：若做过「应急导出手机钥匙」，导出文件不会因换钥匙失效
 *     （导出文件+旧24词+当时口令仍=整个钱包），需自行销毁旧导出文件；
 *   - 前置：输入当前恢复密码或 24 个助记词；预计 1-3 分钟；Face ID 双确认；
 *   - 反诈提示：官方不会索要 24 词/恢复密码/邮箱验证码/备份文件/口令；
 *   - 按钮「开始换钥匙」（执行边界，不可逆，未点）/「先不换」（安全退出）。
 * → 结论更正：v2 存在独立且完整的密钥轮换入口。实际执行换钥匙未授权测试（不可逆）。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue3-rotate.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue3-rotate.mjs --apply
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
  path.join(
    ROOT_DIR,
    'findings',
    'assets',
    'feishu-issue3-rotate',
    'rotate-entry-xinhuan-20261014.png',
  ),
];

const REGRESSION_NOTE =
  '【2026-10-14 人工导航补证（只读观察，未执行）】更正此前结论：v2 **有**独立密钥轮换入口。\n' +
  '入口路径：设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」（独立菜单项）。\n' +
  '轮换页标题「换一套新钥匙」，页面说明完整：\n' +
  '- 手机 / 服务器 / 备份三份全部换新，钱包地址不变；换后给一组新的 24 个助记词，旧的 24 词与旧备份作废；\n' +
  '- 警示：若做过「应急导出手机钥匙」，导出文件不会因换钥匙失效（导出文件+旧24词+当时口令仍=整个钱包），需自行销毁旧导出文件；\n' +
  '- 前置：输入当前恢复密码或 24 个助记词证明备份在手；预计 1-3 分钟（服务器要准备素数）；开始时 Face ID 确认一次，抄好新 24 词点「继续」后再确认一次才换到新钥匙；\n' +
  '- 反诈提示：官方不会索要 24 词/恢复密码/邮箱验证码/备份文件/口令。\n' +
  '按钮：「开始换钥匙」（执行边界，不可逆，**未点**）/「先不换」（安全退出）。\n' +
  '结论更正：此前「v2 无独立轮换入口、轮换=恢复」判断有误——轮换入口与流程说明完整存在（见截图）。' +
  '**实际执行换钥匙未授权测试**（不可逆操作），执行成败/新 24 词下发未验证。' +
  '另：AI「保护这台手机」返回 not_applicable 属独立 UX 问题（见 issue 15），与本入口无关。\n' +
  '状态：待确认（入口存在已证实；实际换钥匙未实测）。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 3（reczz28MNNXaNbKw）← 追加 ${SHOTS.length} 张证据截图 + 更正回归备注`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '3');
  if (!rec) {
    console.warn('  ! 找不到序号 3，跳过');
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
    回归验证状态: '待确认',
    APP截图: merged,
  });
  console.log(`  ✓ issue 3 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归备注已更正、状态=待确认`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
