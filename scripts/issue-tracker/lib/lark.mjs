/**
 * 飞书多维表格（Base）操作的最小封装。
 *
 * 认证：优先用 LARK_ACCESS_TOKEN，否则复用 lark-mcp 的本地 OAuth 会话
 * （需要 user token 带 bitable:app；应用身份 tenant token 没这个权限）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const API = 'https://open.larksuite.com';

const STORE_CANDIDATES = () => [
  process.env.LARK_MCP_PACKAGE_ROOT &&
    path.join(process.env.LARK_MCP_PACKAGE_ROOT, 'dist/auth/store.js'),
  '/Users/zhangleping/.npm/_npx/74dfe5d932228314/node_modules/@larksuiteoapi/lark-mcp/dist/auth/store.js',
];

export async function getUserToken() {
  if (process.env.LARK_ACCESS_TOKEN) return process.env.LARK_ACCESS_TOKEN;
  const storePath = STORE_CANDIDATES().find((candidate) => candidate && fs.existsSync(candidate));
  if (!storePath) {
    throw new Error(
      '找不到 lark-mcp 的登录会话。请先执行 node scripts/issue-tracker/authorize-lark.mjs，或用 LARK_ACCESS_TOKEN 指定 token。',
    );
  }
  const store = createRequire(import.meta.url)(storePath).authStore;
  const tokens = Object.values((await store.getAllLocalAccessTokens()) ?? {});
  store.destroy?.();
  if (tokens.length === 0) {
    throw new Error('本地没有可用的飞书登录会话（需要 bitable:app 权限）。请先运行 authorize-lark.mjs。');
  }
  return tokens[0];
}

export function permissionHint(result) {
  return result.code === 99991679 || result.code === 99991672
    ? '\n  提示：这是飞书权限问题。需要 user access token 带 bitable:app 权限，' +
        '并且当前账号对该 Base 有编辑权限。先跑 authorize-lark.mjs 重新授权。'
    : '';
}

export function createClient(token) {
  const headers = { Authorization: `Bearer ${token}` };

  async function request(method, apiPath, body, { multipart } = {}) {
    const requestHeaders = { ...headers };
    let payload;
    if (multipart) {
      payload = multipart;
    } else if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${API}${apiPath}`, {
      method,
      headers: requestHeaders,
      body: payload,
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { code: -1, msg: text.slice(0, 300) };
    }
  }

  function must(result, context) {
    if (result.code !== 0) {
      throw new Error(`${context} 失败：code=${result.code} msg=${result.msg}${permissionHint(result)}`);
    }
    return result;
  }

  return {
    async createBase(name, folderToken) {
      const result = await request('POST', '/open-apis/bitable/v1/apps', {
        name,
        ...(folderToken ? { folder_token: folderToken } : {}),
      });
      return must(result, `创建多维表格「${name}」`).data.app;
    },
    async listTables(appToken) {
      return must(
        await request('GET', `/open-apis/bitable/v1/apps/${appToken}/tables?page_size=200`),
        '列出数据表',
      ).data.items ?? [];
    },
    async createTable(appToken, { name, viewName, fields }) {
      const result = await request('POST', `/open-apis/bitable/v1/apps/${appToken}/tables`, {
        table: { name, default_view_name: viewName, fields },
      });
      return must(result, `创建数据表「${name}」`).data.table_id;
    },
    async listFields(appToken, tableId) {
      return must(
        await request(
          'GET',
          `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=200`,
        ),
        '列出字段',
      ).data.items ?? [];
    },
    async createField(appToken, tableId, field) {
      const result = await request(
        'POST',
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        {
          field_name: field.field_name,
          type: field.type,
          ...(field.property ? { property: field.property } : {}),
        },
      );
      return must(result, `创建字段 ${field.field_name}`).data.field;
    },
    async deleteTable(appToken, tableId) {
      const result = await request(
        'DELETE',
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}`,
      );
      return must(result, `删除数据表 ${tableId}`).data;
    },
    async renameTable(appToken, tableId, name) {
      // 更新数据表用的是 PATCH；PUT 会 404。
      const result = await request('PATCH', `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}`, {
        name,
      });
      return must(result, `重命名数据表 ${tableId}`).data;
    },
    async batchDeleteRecords(appToken, tableId, recordIds) {
      let deleted = 0;
      for (let index = 0; index < recordIds.length; index += 500) {
        const chunk = recordIds.slice(index, index + 500);
        const result = must(
          await request(
            'POST',
            `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`,
            { records: chunk },
          ),
          `批量删除记录（第 ${index + 1} 条起）`,
        );
        deleted += result.data?.records?.length ?? chunk.length;
      }
      return deleted;
    },
    async listAllRecords(appToken, tableId) {
      const records = [];
      let pageToken = '';
      do {
        const result = must(
          await request(
            'POST',
            `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?page_size=500${
              pageToken ? `&page_token=${pageToken}` : ''
            }`,
            {},
          ),
          '读取记录',
        );
        records.push(...(result.data?.items ?? []));
        pageToken = result.data?.has_more ? result.data.page_token : '';
      } while (pageToken);
      return records;
    },
    async batchCreate(appToken, tableId, rows) {
      let created = 0;
      for (let index = 0; index < rows.length; index += 200) {
        const chunk = rows.slice(index, index + 200);
        const result = must(
          await request(
            'POST',
            `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
            { records: chunk.map((fields) => ({ fields })) },
          ),
          `批量写入记录（第 ${index + 1} 条起）`,
        );
        created += result.data?.records?.length ?? chunk.length;
      }
      return created;
    },
    async updateRecord(appToken, tableId, recordId, fields) {
      const result = await request(
        'PUT',
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
        { fields },
      );
      return must(result, `更新记录 ${recordId}`).data?.record;
    },
    async uploadMedia(appToken, filePath) {
      const bytes = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const extension = path.extname(fileName).toLowerCase();
      const mime =
        { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[
          extension
        ] ?? 'application/octet-stream';
      const form = new FormData();
      form.set('file_name', fileName);
      form.set('parent_type', 'bitable_image');
      form.set('parent_node', appToken);
      form.set('size', String(bytes.length));
      form.set('file', new Blob([bytes], { type: mime }), fileName);
      const result = await request('POST', '/open-apis/drive/v1/medias/upload_all', undefined, {
        multipart: form,
      });
      return must(result, `上传 ${fileName}`).data.file_token;
    },
    async rawGet(apiPath) {
      return request('GET', apiPath);
    },
    async rawPatch(apiPath, body) {
      return request('PATCH', apiPath, body);
    },
  };
}

/** 飞书文本字段读回来是富文本片段数组，这里压平成字符串。 */
export function flattenText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join('');
  if (typeof value === 'object') return value.text ?? value.name ?? '';
  return String(value);
}
