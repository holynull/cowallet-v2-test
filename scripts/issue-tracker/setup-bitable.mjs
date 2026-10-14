#!/usr/bin/env node
/**
 * 在飞书 Base 里准备「记录 issue」的多维表格：建表 / 补字段 / 导入 issue / 挂证据截图 / 回读校验。
 *
 * 用法：
 *   node scripts/issue-tracker/setup-bitable.mjs --plan              # 只打印将要执行的动作（默认）
 *   node scripts/issue-tracker/setup-bitable.mjs --apply             # 建表并补齐字段
 *   node scripts/issue-tracker/setup-bitable.mjs --apply --import    # 再导入 issue 记录
 *   node scripts/issue-tracker/setup-bitable.mjs --apply --import --attach   # 再上传并挂上本地证据截图
 *   node scripts/issue-tracker/setup-bitable.mjs --verify            # 回读远端状态
 *
 * 认证：默认复用 lark-mcp 本地 OAuth 会话（需要 bitable:app 权限），
 *       也可以用环境变量 LARK_ACCESS_TOKEN 显式传入 user access token。
 *
 * 需要先跑：node scripts/issue-tracker/build-issue-dataset.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { rowToFields as mapRowToFields } from './lib/issue-mapping.mjs';

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIBLING = path.resolve(ROOT_DIR, '..');
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'scripts/issue-tracker/table-spec.json'), 'utf8'));
const DATASET = path.join(ROOT_DIR, 'scripts/issue-tracker/dist/cowallet-issues.json');
const API = 'https://open.larksuite.com';

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APPLY = hasFlag('--apply');
const IMPORT = hasFlag('--import');
const ATTACH = hasFlag('--attach');
const SYNC = hasFlag('--sync');
const VERIFY = hasFlag('--verify');
const TABLE_ID_OPTION = getOption('--table', '');
const TABLE_NAME = getOption('--table-name', SPEC.defaultTableName);

async function getToken() {
  if (process.env.LARK_ACCESS_TOKEN) return process.env.LARK_ACCESS_TOKEN;
  const candidates = [
    process.env.LARK_MCP_PACKAGE_ROOT &&
      path.join(process.env.LARK_MCP_PACKAGE_ROOT, 'dist/auth/store.js'),
    '/Users/zhangleping/.npm/_npx/74dfe5d932228314/node_modules/@larksuiteoapi/lark-mcp/dist/auth/store.js',
  ].filter(Boolean);
  const storePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!storePath) {
    throw new Error('找不到 lark-mcp 的登录会话；请设置 LARK_ACCESS_TOKEN 或 LARK_MCP_PACKAGE_ROOT。');
  }
  const authStore = require(storePath).authStore;
  const tokens = Object.values((await authStore.getAllLocalAccessTokens()) ?? {});
  authStore.destroy?.();
  if (tokens.length === 0) {
    throw new Error('本地没有可用的飞书登录会话。请先执行一次带 bitable 权限的 OAuth 登录。');
  }
  return tokens[0];
}

let TOKEN = '';

async function api(method, apiPath, body, { multipart } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let payload;
  if (multipart) {
    payload = multipart;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${apiPath}`, { method, headers, body: payload });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { code: -1, msg: text.slice(0, 300) };
  }
  return parsed;
}

function fail(context, result) {
  const hint =
    result.code === 99991679 || result.code === 99991672
      ? '\n  提示：这是飞书权限问题。需要给 user access token 授予 bitable:app 权限（重新授权登录），' +
        '并且当前账号要对该 Base 有编辑权限。'
      : '';
  throw new Error(`${context} 失败：code=${result.code} msg=${result.msg}${hint}`);
}

async function listTables() {
  const result = await api('GET', `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables?page_size=200`);
  if (result.code !== 0) fail('列出数据表', result);
  return result.data.items ?? [];
}

async function listFields(tableId) {
  const result = await api(
    'GET',
    `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables/${tableId}/fields?page_size=200`,
  );
  if (result.code !== 0) fail('列出字段', result);
  return result.data.items ?? [];
}

async function createTable() {
  const fields = SPEC.fields.map(({ field_name, type, property }) => ({
    field_name,
    type,
    ...(property ? { property } : {}),
  }));
  const result = await api('POST', `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables`, {
    table: { name: TABLE_NAME, default_view_name: SPEC.defaultViewName, fields },
  });
  if (result.code !== 0) fail('创建数据表', result);
  return result.data.table_id;
}

async function createField(tableId, field) {
  const result = await api(
    'POST',
    `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables/${tableId}/fields`,
    { field_name: field.field_name, type: field.type, ...(field.property ? { property: field.property } : {}) },
  );
  if (result.code !== 0) fail(`创建字段 ${field.field_name}`, result);
  return result.data.field;
}

async function listAllRecords(tableId) {
  const records = [];
  let pageToken = '';
  do {
    const result = await api(
      'POST',
      `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables/${tableId}/records/search?page_size=500${
        pageToken ? `&page_token=${pageToken}` : ''
      }`,
      {},
    );
    if (result.code !== 0) fail('读取记录', result);
    records.push(...(result.data?.items ?? []));
    pageToken = result.data?.has_more ? result.data.page_token : '';
  } while (pageToken);
  return records;
}

async function batchCreate(tableId, rows) {
  let created = 0;
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const result = await api(
      'POST',
      `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables/${tableId}/records/batch_create`,
      { records: chunk.map((fields) => ({ fields })) },
    );
    if (result.code !== 0) fail(`批量写入记录（第 ${index + 1} 条起）`, result);
    created += result.data?.records?.length ?? chunk.length;
  }
  return created;
}

async function updateRecord(tableId, recordId, fields) {
  const result = await api(
    'PUT',
    `/open-apis/bitable/v1/apps/${SPEC.appToken}/tables/${tableId}/records/${recordId}`,
    { fields },
  );
  if (result.code !== 0) fail(`更新记录 ${recordId}`, result);
  return result.data?.record;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function uploadMedia(filePath) {
  const bytes = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const form = new FormData();
  form.set('file_name', fileName);
  form.set('parent_type', 'bitable_image');
  form.set('parent_node', SPEC.appToken);
  form.set('size', String(bytes.length));
  form.set('file', new Blob([bytes], { type: MIME[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream' }), fileName);
  const result = await api('POST', '/open-apis/drive/v1/medias/upload_all', undefined, { multipart: form });
  if (result.code !== 0) {
    throw new Error(`上传 ${fileName} 失败：code=${result.code} msg=${result.msg}`);
  }
  return result.data.file_token;
}

function resolveEvidence(relativePath) {
  const absolute = path.join(SIBLING, relativePath);
  return fs.existsSync(absolute) ? absolute : null;
}

// 字段映射与选项口径抽到 lib/issue-mapping.mjs，和新建多维表格的脚本共用一套。
const rowToFields = mapRowToFields;

/** 飞书文本字段读回来是富文本片段数组，这里压平成一行，便于校验输出。 */
function flattenText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (typeof value === 'object') return value.text ?? value.name ?? '';
  return String(value);
}

async function main() {
  console.log(`Base: ${SPEC.baseUrl}`);
  let tables = null;
  if (TOKEN) {
    tables = await listTables();
    console.log(`现有数据表 ${tables.length} 个：`);
    for (const table of tables) console.log(`  - ${table.name} (${table.table_id})`);
  }

  let tableId = TABLE_ID_OPTION;
  if (!tableId && tables) {
    tableId = tables.find((table) => table.name === TABLE_NAME)?.table_id ?? '';
  }

  if (!APPLY && !VERIFY) {
    console.log('\n-- 计划（dry-run）--');
    console.log(`目标数据表：${tableId || `未找到，将创建「${TABLE_NAME}」`}`);
    console.log(`字段 ${SPEC.fields.length} 个：${SPEC.fields.map((field) => field.field_name).join('、')}`);
    if (IMPORT) {
      const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
      console.log(`待导入记录：${dataset.count} 条（来自 scripts/issue-tracker/dist/cowallet-issues.json）`);
    }
    if (ATTACH) console.log('会为带本地证据的 issue 上传并挂载截图');
    console.log('\n加 --apply 才会真正写入远端。');
    return;
  }

  if (APPLY) {
    if (!tableId) {
      tableId = await createTable();
      console.log(`\n已创建数据表「${TABLE_NAME}」：${tableId}`);
    } else {
      console.log(`\n使用已有数据表：${tableId}`);
    }

    const existing = new Set((await listFields(tableId)).map((field) => field.field_name));
    const missing = SPEC.fields.filter((field) => !existing.has(field.field_name));
    if (missing.length === 0) {
      console.log('字段已齐全，无需补齐。');
    } else {
      for (const field of missing) {
        await createField(tableId, field);
        console.log(`  + 新增字段 ${field.field_name}`);
      }
    }

    if (IMPORT) {
      const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
      const records = await listAllRecords(tableId);
      if (records.length > 0) {
        console.log(`\n远端已有 ${records.length} 条记录；为避免重复，本次不自动导入。`);
        console.log('如需重新导入，请先手动清空该表，或用 --table 指定一个空表。');
      } else {
        const payloads = [];
        let skippedEvidence = 0;
        let failedUploads = 0;
        for (const row of dataset.rows) {
          const attachments = {};
          if (ATTACH && row.evidence?.length) {
            const tokens = [];
            for (const relativePath of row.evidence) {
              const absolute = resolveEvidence(relativePath);
              if (!absolute) {
                skippedEvidence += 1;
                continue;
              }
              try {
                tokens.push(await uploadMedia(absolute));
              } catch (error) {
                failedUploads += 1;
                console.warn(`  ! ${path.basename(absolute)}：${error instanceof Error ? error.message : error}`);
              }
            }
            if (tokens.length) attachments.APP截图 = tokens;
          }
          payloads.push(rowToFields(row, attachments));
        }
        const created = await batchCreate(tableId, payloads);
        console.log(
          `\n已导入 ${created} 条记录` +
            `（证据文件缺失跳过 ${skippedEvidence} 个${failedUploads ? `，上传失败 ${failedUploads} 个` : ''}）。`,
        );
      }
    }

    if (SYNC) {
      const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
      const records = await listAllRecords(tableId);
      const bySequence = new Map(records.map((record) => [flattenText(record.fields?.序号), record]));
      let updated = 0;
      let unmatched = 0;
      for (const row of dataset.rows) {
        const record = bySequence.get(row.sequence);
        if (!record) {
          unmatched += 1;
          continue;
        }
        const fields = rowToFields(row, {});
        delete fields.序号;
        await updateRecord(tableId, record.record_id, fields);
        updated += 1;
      }
      console.log(`\n已同步 ${updated} 条记录的文字字段${unmatched ? `（${unmatched} 条匹配不到，已跳过）` : ''}；附件不受影响。`);
    }
  }

  if (APPLY || VERIFY) {
    if (!tableId) {
      console.log('\n没有目标表，跳过校验。');
      return;
    }
    const fields = await listFields(tableId);
    const records = await listAllRecords(tableId);
    console.log('\n-- 回读校验 --');
    console.log(`字段 ${fields.length} 个：${fields.map((field) => field.field_name).join('、')}`);
    console.log(`记录 ${records.length} 条`);
    const withAttachments = records.filter((record) => (record.fields?.APP截图 ?? []).length > 0);
    console.log(`其中 ${withAttachments.length} 条带 APP截图 附件`);
    for (const record of records.slice(0, 6)) {
      const fields = record.fields ?? {};
      const attachments = (fields.APP截图 ?? []).length;
      console.log(
        `  · [${flattenText(fields.序号)}] ${flattenText(fields.Issue).slice(0, 42)}` +
          ` | ${flattenText(fields.平台) || '-'} | ${flattenText(fields.严重程度) || '-'}` +
          ` | ${flattenText(fields.问题归类) || '-'} | ${flattenText(fields.反馈状态) || '-'}` +
          ` | 附件 ${attachments}`,
      );
    }
    console.log(`\n表格地址：${SPEC.baseUrl}?table=${tableId}`);
  }
}

try {
  TOKEN = await getToken();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (APPLY || VERIFY) {
    console.error(`[fail] ${message}`);
    process.exit(2);
  }
  console.log(`[提示] 没拿到飞书登录态：${message}`);
  console.log('[提示] 下面只打印本地计划，不会访问远端。');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
