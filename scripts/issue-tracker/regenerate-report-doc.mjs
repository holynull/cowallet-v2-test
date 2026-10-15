#!/usr/bin/env node
/**
 * 从本地 markdown 重新生成飞书测试报告文档（docx_builtin import）。
 *
 * 背景：旧报告文档（SXCEdr07AoAgNEx58qKjhlTPpPe）由 markdown 导入生成，后续块级编辑
 * 对表格删除/单元格更新不可靠（DELETE 404、单元格 PATCH 需要内部 text block）。
 * 结论：以 `docs/TEST-REPORT-2026-10-14.md` 为唯一事实源，改报告就改 md，再跑本脚本重新导入。
 *
 * 用法：
 *   node scripts/issue-tracker/regenerate-report-doc.mjs          # 生成新文档，打印 document_id + URL
 *   node scripts/issue-tracker/regenerate-report-doc.mjs --title "自定义标题"
 *   node scripts/issue-tracker/regenerate-report-doc.mjs --md docs/TEST-REPORT-2026-10-15.md --title "标题"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);

const API = 'https://open.larksuite.com';
const mdIdx = argv.indexOf('--md');
const MD_PATH = mdIdx >= 0 ? path.join(ROOT_DIR, argv[mdIdx + 1]) : path.join(ROOT_DIR, 'docs', 'TEST-REPORT-2026-10-14.md');
const titleIdx = argv.indexOf('--title');
const TITLE = titleIdx >= 0 ? argv[titleIdx + 1] : 'CoWallet v2 测试报告（生成）';

async function main() {
  const token = await getUserToken();
  const bytes = fs.readFileSync(MD_PATH);
  const fileName = path.basename(MD_PATH);

  // 1) 上传 markdown 为导入用媒体
  const form = new FormData();
  form.set('file_name', 'docx.md');
  form.set('parent_type', 'ccm_import_open');
  form.set('parent_node', '/');
  form.set('size', String(bytes.length));
  form.set('extra', JSON.stringify({ obj_type: 'docx', file_extension: 'md' }));
  form.set('file', new Blob([bytes], { type: 'text/markdown' }), 'docx.md');

  console.log(`上传 ${MD_PATH} …`);
  const up = await fetch(`${API}/open-apis/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upJson = await up.json();
  if (upJson.code !== 0) {
    throw new Error(`上传失败：code=${upJson.code} msg=${upJson.msg}${JSON.stringify(upJson.error ?? '')}`);
  }
  const fileToken = upJson.data?.file_token;
  console.log(`  已上传，file_token=${fileToken}，创建导入任务…`);

  // 2) 创建导入任务
  const task = await fetch(`${API}/open-apis/drive/v1/import_tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_extension: 'md',
      file_name: fileName,
      file_token: fileToken,
      type: 'docx',
      point: { mount_type: 1, mount_key: '' },
    }),
  });
  const taskJson = await task.json();
  if (taskJson.code !== 0) {
    throw new Error(`创建导入任务失败：code=${taskJson.code} msg=${taskJson.msg}${JSON.stringify(taskJson.error ?? '')}`);
  }
  const ticket = taskJson.data?.ticket;
  console.log(`  已提交，ticket=${ticket}，轮询导入结果…`);

  // 3) 轮询
  let doc = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${API}/open-apis/drive/v1/import_tasks/${ticket}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p = await poll.json();
    if (p.code !== 0) throw new Error(`查询导入状态失败：${JSON.stringify(p)}`);
    const jobStatus = p.data?.result?.job_status;
    if (jobStatus === 0) {
      doc = p.data?.result;
      break;
    }
    if (jobStatus !== 1 && jobStatus !== 2) {
      throw new Error(`导入异常：${JSON.stringify(p.data)}`);
    }
    process.stdout.write('.');
  }
  if (!doc) throw new Error('导入超时');

  const documentId = doc.document_id ?? doc.token ?? doc.doc_token;
  const url = doc.url ?? `https://catwallet.jp.larksuite.com/docx/${documentId}`;
  console.log('\n=== 生成完成 ===');
  console.log(`document_id: ${documentId}`);
  console.log(`URL: ${url}`);
  console.log(`标题建议：${TITLE}（可到飞书改标题）`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
