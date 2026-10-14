#!/usr/bin/env node
/**
 * 新建一个独立的多维表格（Base），里面放两张表：
 *   1. Issue list           —— 汇总所有已收集的 issue（94 条），带证据截图附件
 *   2. Cowallet v2 测试 原文 —— 链接文档《Cowallet v2 测试》的原文，逐条保留，并指回对应的 Issue 序号
 *
 * 前置：
 *   node scripts/issue-tracker/build-issue-dataset.mjs      # 生成 issue 数据集
 *   node scripts/issue-tracker/fetch-source-doc.mjs         # 抓取并解析文档原文
 *   node scripts/issue-tracker/authorize-lark.mjs           # 需要带 bitable:app 的 user token
 *
 * 用法：
 *   node scripts/issue-tracker/create-v2-base.mjs                 # dry-run：只打印计划
 *   node scripts/issue-tracker/create-v2-base.mjs --apply         # 新建并向两张表导入数据
 *   node scripts/issue-tracker/create-v2-base.mjs --apply --base-name "自定义名称"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';
import { rowToFields } from './lib/issue-mapping.mjs';
import { V2_EVIDENCE_DIR, V2_EVIDENCE_MAPPING } from './lib/v2-evidence.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'scripts/issue-tracker/table-spec.json'), 'utf8'));
const ISSUE_SOURCE = path.join(ROOT_DIR, 'scripts/issue-tracker/sources/cowallet-v2-wiki-items.json');
const DOC_ROWS = path.join(ROOT_DIR, 'scripts/issue-tracker/sources/cowallet-v2-wiki-doc.rows.json');
const EVIDENCE_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'cowallet-v2-round1');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE_NAME = getOption('--base-name', 'Cowallet v2 Issue List');
const ISSUE_TABLE_NAME = 'Issue list';
const DOC_TABLE_NAME = 'Cowallet v2 测试 原文';

const DOC_TABLE_FIELDS = [
  { field_name: '序号', type: 1, description: '对应文档里的条目号；审查发现用 6.1/6.2/6.3' },
  {
    field_name: '类型',
    type: 3,
    property: {
      options: [{ name: '问题' }, { name: '审查说明' }, { name: '审查发现' }, { name: '结论' }],
    },
  },
  { field_name: '原文内容', type: 1, description: '文档原文，未改写' },
  {
    field_name: '文档标注状态',
    type: 3,
    description: '文档里写的修复状态，不代表回归结论',
    property: { options: [{ name: '未修复' }, { name: '已修复' }, { name: '未标注' }] },
  },
  {
    field_name: '级别',
    type: 3,
    property: { options: [{ name: 'HIGH' }, { name: 'MEDIUM' }, { name: 'LOW' }] },
  },
  { field_name: '代码位置', type: 1, description: '文件 + 行号' },
  { field_name: '证据截图', type: 17 },
  { field_name: '对应 Issue 序号', type: 1, description: '指回 Issue list 表的序号' },
  { field_name: '来源文档', type: 1 },
];

/** 新建的多维表格会自带一张只有空白行的模板表，这种才算“可删”。 */
function isBlankRecord(record) {
  return Object.values(record.fields ?? {}).every((value) => {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'number') return false;
    return String(value).trim() === '';
  });
}

/** 只导入《Cowallet v2 测试》文档里的内容（文档问题 + 审查发现），不含 v1 历史。 */
function loadIssueRows() {
  return JSON.parse(fs.readFileSync(ISSUE_SOURCE, 'utf8')).map((item, index) => ({
    ...item,
    sequence: String(index + 1),
    platforms: item.platforms ?? [],
    evidence: item.evidence ?? [],
    ticket: item.ticket ?? '',
  }));
}

async function importIssueRows(client, appToken, tableId, rows) {
  const payloads = [];
  for (const row of rows) {
    payloads.push(rowToFields(row, {}));
  }
  const created = await client.batchCreate(appToken, tableId, payloads);
  console.log(`  ${ISSUE_TABLE_NAME}：已导入 ${created} 条（文档内容）`);
}

async function importDocRows(client, appToken, tableId, rows) {
  const payloads = [];
  for (const row of rows) {
    const fields = {
      序号: row.sequence,
      类型: row.type,
      原文内容: row.content,
      来源文档: row.source,
    };
    if (row.docState) fields.文档标注状态 = row.docState;
    if (row.level) fields.级别 = row.level;
    if (row.codeLocation) fields.代码位置 = row.codeLocation;
    if (row.issueRefs) fields['对应 Issue 序号'] = row.issueRefs;
    if (row.screenshots?.length) {
      const tokens = [];
      for (const file of row.screenshots) {
        tokens.push(await client.uploadMedia(appToken, path.join(EVIDENCE_DIR, file)));
      }
      fields.证据截图 = tokens.map((file_token) => ({ file_token }));
    }
    payloads.push(fields);
  }
  const created = await client.batchCreate(appToken, tableId, payloads);
  console.log(`  ${DOC_TABLE_NAME}：已导入 ${created} 行`);
}

/** 把文档里的证据截图挂到对应 Issue 记录（序号 2/3/4/5）。 */
async function attachV2Evidence(client, appToken, tableId) {
  const records = await client.listAllRecords(appToken, tableId);
  let attached = 0;
  for (const item of V2_EVIDENCE_MAPPING) {
    const record = records.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    if (!record) continue;
    const tokens = [];
    for (const file of item.files) {
      tokens.push({
        file_token: await client.uploadMedia(appToken, path.join(ROOT_DIR, ...V2_EVIDENCE_DIR, file)),
      });
    }
    const existing = record.fields?.APP截图 ?? [];
    await client.updateRecord(appToken, tableId, record.record_id, {
      APP截图: [...existing.map(({ file_token }) => ({ file_token })), ...tokens],
    });
    attached += tokens.length;
  }
  console.log(`  已挂上文档证据截图 ${attached} 张（序号 ${V2_EVIDENCE_MAPPING.map((item) => item.sequence).join('/')}）`);
}

async function main() {
  const issueRows = loadIssueRows();
  const doc = JSON.parse(fs.readFileSync(DOC_ROWS, 'utf8'));

  console.log('-- 计划 --');
  console.log(`新建多维表格：${BASE_NAME}`);
  console.log(`  表 1 ${ISSUE_TABLE_NAME}：${SPEC.fields.length} 个字段 ← ${issueRows.length} 条（《Cowallet v2 测试》文档内容）`);
  console.log(`  表 2 ${DOC_TABLE_NAME}：${DOC_TABLE_FIELDS.length} 个字段 ← ${doc.rows.length} 行文档原文`);
  console.log(`  文档来源：《${doc.doc.title}》${doc.doc.wikiUrl}`);
  if (!APPLY) {
    console.log('\n加 --apply 才会真正创建。');
    return;
  }

  const token = await getUserToken();
  const client = createClient(token);

  const base = await client.createBase(BASE_NAME);
  const appToken = base.app_token;
  console.log(`\n已创建多维表格：${base.name}`);
  console.log(`  app_token: ${appToken}`);
  console.log(`  url: ${base.url ?? `https://catwallet.jp.larksuite.com/base/${appToken}`}`);

  const issueTableId = await client.createTable(appToken, {
    name: ISSUE_TABLE_NAME,
    viewName: SPEC.defaultViewName,
    fields: SPEC.fields.map(({ field_name, type, property }) => ({
      field_name,
      type,
      ...(property ? { property } : {}),
    })),
  });
  console.log(`  + 表 ${ISSUE_TABLE_NAME}: ${issueTableId}`);

  const docTableId = await client.createTable(appToken, {
    name: DOC_TABLE_NAME,
    viewName: '文档原文',
    fields: DOC_TABLE_FIELDS.map(({ field_name, type, property }) => ({
      field_name,
      type,
      ...(property ? { property } : {}),
    })),
  });
  console.log(`  + 表 ${DOC_TABLE_NAME}: ${docTableId}`);

  await importIssueRows(client, appToken, issueTableId, issueRows);
  await attachV2Evidence(client, appToken, issueTableId);
  await importDocRows(client, appToken, docTableId, doc.rows);

  // 新建的多维表格自带一张只有空白行的模板表，确认没有实际内容后删掉，保持整洁。
  const tables = await client.listTables(appToken);
  for (const table of tables) {
    if (table.table_id === issueTableId || table.table_id === docTableId) continue;
    const records = await client.listAllRecords(appToken, table.table_id);
    if (records.length === 0 || records.every(isBlankRecord)) {
      await client.deleteTable(appToken, table.table_id);
      console.log(`  - 已删除自带的空白模板表 ${table.name} (${table.table_id})，其中只有 ${records.length} 行空白`);
    } else {
      console.log(`  ! 保留数据表 ${table.name}（${records.length} 条记录，未删除）`);
    }
  }

  console.log('\n-- 回读校验 --');
  for (const [name, tableId] of [
    [ISSUE_TABLE_NAME, issueTableId],
    [DOC_TABLE_NAME, docTableId],
  ]) {
    const fields = await client.listFields(appToken, tableId);
    const records = await client.listAllRecords(appToken, tableId);
    const attachmentField = name === ISSUE_TABLE_NAME ? 'APP截图' : '证据截图';
    const withAttachments = records.filter((record) => (record.fields?.[attachmentField] ?? []).length > 0);
    console.log(`  ${name}：${fields.length} 字段 / ${records.length} 条 / ${withAttachments.length} 条带截图`);
    for (const record of records.slice(0, 3)) {
      console.log(
        `    · [${flattenText(record.fields?.序号)}] ` +
          `${flattenText(record.fields?.[name === ISSUE_TABLE_NAME ? 'Issue' : '原文内容']).replace(/\n/g, ' ').slice(0, 50)}`,
      );
    }
  }
  console.log(`\n打开：https://catwallet.jp.larksuite.com/base/${appToken}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
