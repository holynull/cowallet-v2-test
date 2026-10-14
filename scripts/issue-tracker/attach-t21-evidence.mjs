#!/usr/bin/env node
/**
 * T21（分片表述一致性回归）证据归档：issue 4 → 追加回归截图、更新回归验证状态为「已验收」。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t21-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t21-evidence.mjs --apply
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
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue4-regression', 't21-settings-three-keys.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue4-regression', 't21-ai-shard-answer.png'),
];

const REGRESSION_NOTE =
  '【2026-10-14 回归验收（T21 只读）】设置「密钥检查 → 三份钥匙」页：第 1 份·手机（Secure Enclave）、' +
  '第 2 份·服务器（CoWallet 服务器·加密存储）、第 3 份·你保管（24 个助记词 + 恢复密码加密备份）。' +
  'AI 回答「我的钱包密钥分片存在哪里？」：手机份（Secure Enclave）/ 服务器份（CoWallet 服务器 · AWS Nitro Enclave）/ ' +
  '你自己保管的备份（24 个词）。两处分片数量（3）与存放位置（手机/服务器/你保管）一致，' +
  'AI 明确承认「服务器份—加密存在 CoWallet 服务器」，此前「没有第三片存在任何服务器上」的矛盾表述未再出现。' +
  '结论：issue 4 的分片表述矛盾在本次构建上已消除，回归验收通过。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 4（reczz28MNNXaNJAh）← 追加 ${SCREENSHOTS.length} 张回归截图 + 回归备注 + 状态→已验收`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '4');
  if (!rec) {
    console.warn('  ! 找不到序号 4，跳过');
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
  console.log(`  ✓ 序号 4 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归状态→已验收`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
