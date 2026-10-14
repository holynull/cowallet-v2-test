#!/usr/bin/env node
/**
 * T24（备份验证回归）证据归档：issue 2 → 追加回归截图、更新回归验证状态为「已验收」。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t24-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t24-evidence.mjs --apply
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';
const SCREENSHOTS = [
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue2-regression', 't24-verify-popup-masked-password.jpeg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue2-regression', 't24-third-shard-pass-banner.jpeg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue2-regression', 't24-third-shard-verified.jpeg'),
];

const REGRESSION_NOTE =
  '【2026-10-14 回归验收（T24，本地备份解密验证，未导出/未签名/未动资金）】' +
  '进入「设置 → 密钥检查 → 三份钥匙」，点「现在花 30 秒测一下」，输入恢复密码（.env 提供，未回显）后点「开始检查」，' +
  '第 3 份·你保管 状态由「尚未验证」变为「✓ 已验证 刚刚」，并显示「上次测试：今天，通过」；' +
  '钥匙串里：有（第 1 代）；服务器上的加密副本：有（第 1 代）。' +
  '此前「iCloud 已登录但第三片提示未登录、无法备份」的症状未再出现：第三片备份可正常打开/验证，状态提示正确。' +
  '结论：issue 2 的第三片备份状态提示问题在本次构建上已消除，回归验收通过。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 2（reczz28MNNXaLGEs）← 追加 ${SCREENSHOTS.length} 张回归截图 + 回归备注 + 状态→已验收`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '2');
  if (!rec) {
    console.warn('  ! 找不到序号 2，跳过');
    return;
  }
  const uploaded = [];
  for (const file of SCREENSHOTS) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  const existing = rec.fields.APP截图 ?? [];
  const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
  await client.updateRecord(APP_TOKEN, TABLE_ID, rec.record_id, {
    回归验证状态: '已验收',
    回归备注: REGRESSION_NOTE,
    APP截图: merged,
  });
  console.log(`  ✓ 序号 2 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归状态→已验收`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
