#!/usr/bin/env node
/**
 * 重建 Issue list 表：只放《Cowallet v2 测试》文档里的内容（8 条），
 * 并按文档内容使用调整后的字段结构（问题类型 / 文档标注状态 / 代码位置）。
 *
 * 为什么是"重建"而不是改：飞书没有调整字段顺序的接口，新增字段只会追加到末尾，
 * 会破坏「问题与证据 → 开发反馈 → 测试回归」的阅读顺序，所以直接按目标结构建新表、
 * 导入完成并校验后再删旧表。
 *
 * 用法：
 *   node scripts/issue-tracker/rebuild-issue-table.mjs                     # dry-run
 *   node scripts/issue-tracker/rebuild-issue-table.mjs --apply             # 执行
 *   node scripts/issue-tracker/rebuild-issue-table.mjs --apply --app-token <app> --replace <旧表ID>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';
import { rowToFields } from './lib/issue-mapping.mjs';
import { V2_EVIDENCE_DIR, V2_EVIDENCE_MAPPING } from './lib/v2-evidence.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'scripts/issue-tracker/table-spec.json'), 'utf8'));
const V2_ITEMS = path.join(ROOT_DIR, 'scripts/issue-tracker/sources/cowallet-v2-wiki-items.json');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APP_TOKEN = getOption('--app-token', 'QVGLbx4zIauLNxsxPZYjHvSbpUh');
const REPLACE_TABLE = getOption('--replace', 'tblbmKIMZWOoIqZE');
const TABLE_NAME = SPEC.defaultTableName;
const TEMP_TABLE_NAME = `${TABLE_NAME} (rebuild)`;

function loadRows() {
  const items = JSON.parse(fs.readFileSync(V2_ITEMS, 'utf8'));
  return items.map((item, index) => ({
    ...item,
    sequence: String(index + 1),
    platforms: item.platforms ?? [],
    evidence: [],
    ticket: item.ticket ?? '',
  }));
}

async function main() {
  const rows = loadRows();
  console.log('-- 计划 --');
  console.log(`Base: ${APP_TOKEN}`);
  console.log(`重建表：${TABLE_NAME}（当前表 ${REPLACE_TABLE} 会在新表校验通过后删除）`);
  console.log(`字段 ${SPEC.fields.length} 个：${SPEC.fields.map((field) => field.field_name).join('、')}`);
  console.log(`内容：${rows.length} 条，全部来自《Cowallet v2 测试》文档`);
  for (const row of rows) {
    console.log(
      `  [${row.sequence}] ${row.category} | 文档标注 ${row.docState ?? '—'} | ${row.severity}` +
        `${row.codeLocation ? ` | ${row.codeLocation}` : ''} → ${row.title.slice(0, 44)}`,
    );
  }
  if (!APPLY) {
    console.log('\n加 --apply 才会执行。');
    return;
  }

  const client = createClient(await getUserToken());

  const tableId = await client.createTable(APP_TOKEN, {
    name: TEMP_TABLE_NAME,
    viewName: SPEC.defaultViewName,
    fields: SPEC.fields.map(({ field_name, type, property }) => ({
      field_name,
      type,
      ...(property ? { property } : {}),
    })),
  });
  console.log(`\n已创建新表：${tableId}`);

  const created = await client.batchCreate(
    APP_TOKEN,
    tableId,
    rows.map((row) => rowToFields(row, {})),
  );
  console.log(`已导入 ${created} 条记录`);

  // 把文档里的证据截图挂到对应记录（序号 2/3/4/5）
  const records = await client.listAllRecords(APP_TOKEN, tableId);
  let attached = 0;
  for (const item of V2_EVIDENCE_MAPPING) {
    const record = records.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    if (!record) continue;
    const tokens = [];
    for (const file of item.files) {
      tokens.push({
        file_token: await client.uploadMedia(APP_TOKEN, path.join(ROOT_DIR, ...V2_EVIDENCE_DIR, file)),
      });
    }
    await client.updateRecord(APP_TOKEN, tableId, record.record_id, {
      APP截图: tokens,
    });
    attached += tokens.length;
  }
  console.log(`已挂上文档证据截图 ${attached} 张`);

  // 校验通过后才动旧表
  const verifyFields = await client.listFields(APP_TOKEN, tableId);
  const verifyRecords = await client.listAllRecords(APP_TOKEN, tableId);
  const withAttachments = verifyRecords.filter((record) => (record.fields?.APP截图 ?? []).length > 0);
  if (verifyFields.length !== SPEC.fields.length || verifyRecords.length !== rows.length) {
    throw new Error(
      `校验不通过：字段 ${verifyFields.length}/${SPEC.fields.length}，记录 ${verifyRecords.length}/${rows.length}；旧表未删除。`,
    );
  }
  console.log(`校验通过：${verifyFields.length} 字段 / ${verifyRecords.length} 条 / ${withAttachments.length} 条带截图`);

  const tables = await client.listTables(APP_TOKEN);
  if (tables.some((table) => table.table_id === REPLACE_TABLE)) {
    const oldRecords = await client.listAllRecords(APP_TOKEN, REPLACE_TABLE);
    await client.deleteTable(APP_TOKEN, REPLACE_TABLE);
    console.log(`已删除旧表 ${REPLACE_TABLE}（原有 ${oldRecords.length} 条记录）`);
  } else {
    console.log(`旧表 ${REPLACE_TABLE} 不存在，跳过删除`);
  }
  await client.renameTable(APP_TOKEN, tableId, TABLE_NAME);
  console.log(`新表已更名为「${TABLE_NAME}」`);

  console.log('\n-- 最终状态 --');
  const finalTables = await client.listTables(APP_TOKEN);
  for (const table of finalTables) {
    const count = (await client.listAllRecords(APP_TOKEN, table.table_id)).length;
    console.log(`  ${table.name} (${table.table_id})：${count} 条`);
  }
  console.log(`\n打开：https://catwallet.jp.larksuite.com/base/${APP_TOKEN}?table=${tableId}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
