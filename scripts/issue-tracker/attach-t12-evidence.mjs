#!/usr/bin/env node
/**
 * 给飞书 Issue list 序号 12（邮箱验证码限流）挂证据截图。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t12-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t12-evidence.mjs --apply
 *   node scripts/issue-tracker/attach-t12-evidence.mjs --apply --app-token <app> --table <table>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const APP_TOKEN = getOption('--app-token', 'QVGLbx4zIauLNxsxPZYjHvSbpUh');
const TABLE_ID = getOption('--table', 'tblQSxhJi3fb4ml7');

/** 从 Midscene HTML 报告按「日志标题」抽取截图 base64。 */
function extractByTitles(runName, titleKeywords, outDir) {
  const reportDir = path.join(REPORTS_DIR, runName, 'report');
  const htmlFiles = fs.readdirSync(reportDir).filter((name) => name.endsWith('.html'));
  if (htmlFiles.length === 0) throw new Error(`${runName} 下没有 HTML 报告`);
  const html = fs.readFileSync(path.join(reportDir, htmlFiles[0]), 'utf8');
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  const seenIds = new Set();
  for (const keyword of titleKeywords) {
    const ids = new Set();
    let searchFrom = 0;
    while (true) {
      const hit = html.indexOf(`name":"`, searchFrom);
      if (hit === -1) break;
      const segment = html.slice(hit, hit + 6000);
      if (segment.includes(keyword)) {
        const refs = [...segment.matchAll(/midscene_screenshot_ref","id":"([0-9a-f-]+)"/g)];
        for (const r of refs) ids.add(r[1]);
        searchFrom = hit + segment.length;
      } else {
        searchFrom = hit + 10;
      }
    }
    if (ids.size === 0) {
      console.warn(`  ! 标题「${keyword}」未匹配到截图`);
      continue;
    }
    for (const id of ids) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const dataMatch = html.match(new RegExp(`${id}">data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)`));
      if (!dataMatch) {
        console.warn(`  ! 引用 ${id} 找不到 base64`);
        continue;
      }
      const [, ext, b64] = dataMatch;
      const file = path.join(outDir, `${runName}-${keyword}-${id.slice(0, 8)}.${ext === 'jpeg' ? 'jpg' : 'png'}`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      files.push(file);
    }
  }
  return files;
}

async function main() {
  const runName = '2026-10-13T06-41-50-349Z-t04-register-send';
  const workDir = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t12');
  const files = extractByTitles(runName, ['T04 注册 - 已填邮箱', 'T04 注册 - 提交邮箱后'], workDir);
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  序号 12 ← ${files.length} 张`);
  for (const file of files) console.log(`    - ${path.basename(file)}`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const record = records.find((r) => flattenText(r.fields?.序号) === '12');
  if (!record) {
    console.warn('  ! 找不到序号 12，跳过');
    return;
  }
  const uploaded = [];
  for (const file of files) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  if (uploaded.length === 0) return;
  const existing = record.fields?.APP截图 ?? [];
  const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
  await client.updateRecord(APP_TOKEN, TABLE_ID, record.record_id, { APP截图: merged });
  console.log(`  ✓ 序号 12 追加 ${uploaded.length} 张（当前 ${merged.length} 张）`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
