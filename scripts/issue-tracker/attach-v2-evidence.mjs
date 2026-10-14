#!/usr/bin/env node
/**
 * 把《Cowallet v2 测试》文档里抽出的证据截图挂到 Issue list 的记录上。
 *
 * 映射关系在 lib/v2-evidence.mjs（逐张看图确认过归属，不是按顺序硬塞）。
 * 已存在的附件会保留，只追加。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-v2-evidence.mjs                                       # dry-run
 *   node scripts/issue-tracker/attach-v2-evidence.mjs --apply
 *   node scripts/issue-tracker/attach-v2-evidence.mjs --apply --app-token <app> --table <table>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';
import { V2_EVIDENCE_DIR, V2_EVIDENCE_MAPPING } from './lib/v2-evidence.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APP_TOKEN = getOption('--app-token', 'Pnr3bYPPmaBqLys4Ss0jgPurpX4');
const TABLE_ID = getOption('--table', 'tblfCEKkuORn4h7E');
const EVIDENCE_DIR = path.join(ROOT_DIR, ...V2_EVIDENCE_DIR);

async function main() {
  for (const item of V2_EVIDENCE_MAPPING) {
    for (const file of item.files) {
      const absolute = path.join(EVIDENCE_DIR, file);
      if (!fs.existsSync(absolute)) throw new Error(`缺少证据文件：${absolute}`);
    }
  }

  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  for (const item of V2_EVIDENCE_MAPPING) {
    console.log(`  序号 ${item.sequence} ${item.issue} ← ${item.files.join(', ')}`);
  }
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);

  for (const item of V2_EVIDENCE_MAPPING) {
    const record = records.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    if (!record) {
      console.warn(`  ! 找不到序号 ${item.sequence} 的记录，跳过`);
      continue;
    }
    const uploaded = [];
    for (const file of item.files) {
      try {
        uploaded.push({
          file_token: await client.uploadMedia(APP_TOKEN, path.join(EVIDENCE_DIR, file)),
        });
      } catch (error) {
        console.warn(`  ! ${file} 上传失败：${error instanceof Error ? error.message : error}`);
      }
    }
    if (uploaded.length === 0) continue;

    const existing = record.fields?.APP截图 ?? [];
    const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
    await client.updateRecord(APP_TOKEN, TABLE_ID, record.record_id, { APP截图: merged });
    console.log(`  ✓ 序号 ${item.sequence} 追加 ${uploaded.length} 张（当前 ${merged.length} 张）`);
  }

  const verify = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  console.log(`\n校验：${verify.length} 条记录，${verify.filter((r) => (r.fields?.APP截图 ?? []).length > 0).length} 条带 APP截图`);
  for (const item of V2_EVIDENCE_MAPPING) {
    const record = verify.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    console.log(
      `  序号 ${item.sequence}: ${(record?.fields?.APP截图 ?? []).map((a) => a.name).join(', ') || '—'}`,
    );
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
