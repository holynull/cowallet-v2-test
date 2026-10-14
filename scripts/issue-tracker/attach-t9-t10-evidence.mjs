#!/usr/bin/env node
/**
 * 把 iOS 真机测试（T01/T03/T15/T16）的证据截图挂到飞书 Issue list
 * 序号 9、10 两条新记录的「APP截图」字段（保留已有附件，只追加）。
 *
 * 截图来自 Midscene HTML 报告内嵌 base64，先抽取到本地再上传。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t9-t10-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t9-t10-evidence.mjs --apply
 *   node scripts/issue-tracker/attach-t9-t10-evidence.mjs --apply --app-token <app> --table <table>
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

/**
 * 从 Midscene HTML 报告按「记录标题」抽取对应截图：
 * 找到 name 含指定标题的 Log 节点，取其中 midscene_screenshot_ref 的 id，
 * 再从 id 处解析出内嵌 base64。避免把操作过程截图也一起抽出来。
 */
function extractScreenshotsByTitles(runName, titleKeywords, outDir) {
  const reportDir = path.join(REPORTS_DIR, runName, 'report');
  const htmlFiles = fs.readdirSync(reportDir).filter((name) => name.endsWith('.html'));
  if (htmlFiles.length === 0) throw new Error(`${runName} 下没有 HTML 报告`);
  const html = fs.readFileSync(path.join(reportDir, htmlFiles[0]), 'utf8');

  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  const seenIds = new Set();
  for (const keyword of titleKeywords) {
    // 找 name 含该标题的 Log 节点，提取节点内所有截图引用 id。
    const refPattern = new RegExp(
      `name":"[^"]*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*".*?midscene_screenshot_ref","id":"([0-9a-f-]+)"`,
      'g',
    );
    const ids = new Set();
    for (const match of html.matchAll(refPattern)) {
      ids.add(match[1]);
    }
    // name 节点里可能有多个 screenshot ref，或标题与 ref 不在同一 capture 内，
    // 兜底：抓所有含该标题的片段再扫描其后的 ref id。
    if (ids.size === 0) {
      let searchFrom = 0;
      while (true) {
        const hit = html.indexOf(`name":"`, searchFrom);
        if (hit === -1) break;
        const segment = html.slice(hit, hit + 4000);
        if (segment.includes(keyword)) {
          const refs = [...segment.matchAll(/midscene_screenshot_ref","id":"([0-9a-f-]+)"/g)];
          for (const r of refs) ids.add(r[1]);
          searchFrom = hit + segment.length;
        } else {
          searchFrom = hit + 10;
        }
      }
    }
    if (ids.size === 0) {
      console.warn(`  ! ${runName} 标题「${keyword}」未匹配到截图`);
      continue;
    }
    for (const id of ids) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      // 从 id 后解析 base64：`id">data:image/png;base64,...`
      const dataMatch = html.match(new RegExp(`${id}">data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)`));
      if (!dataMatch) {
        console.warn(`  ! 引用 ${id} 找不到内嵌 base64`);
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

const PLAN = [
  {
    sequence: '9',
    run: '2026-10-13T04-36-30-687Z-t15-guest-legal-pages-ios',
    titles: ['T15 服务条款 页', 'T15 隐私政策 页'],
    note: 'T15 条款/隐私页（含运营主体占位文案）',
  },
  {
    sequence: '10',
    runs: [
      {
        run: '2026-10-13T03-40-29-675Z-t01-smoke-ios',
        titles: ['cowallet iOS 首屏'],
      },
      {
        run: '2026-10-13T04-21-29-171Z-t03-unauthenticated-entry-ios',
        titles: ['T03 - 创建钱包流程'],
      },
    ],
    note: 'T01 欢迎引导页（开始使用）＋ T03 介绍页（开始创建，进度持久化后）',
  },
];

async function main() {
  const workDir = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t9-t10');
  const extracted = new Map();
  for (const item of PLAN) {
    const collected = [];
    for (const source of item.runs ?? [{ run: item.run, titles: item.titles }]) {
      collected.push(
        ...extractScreenshotsByTitles(source.run, source.titles, path.join(workDir, item.sequence)),
      );
    }
    extracted.set(item.sequence, collected);
  }

  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  for (const item of PLAN) {
    const files = extracted.get(item.sequence);
    console.log(`  序号 ${item.sequence} ${item.note} ← ${files.length} 张`);
    for (const file of files) console.log(`    - ${path.basename(file)}`);
  }
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);

  for (const item of PLAN) {
    const record = records.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    if (!record) {
      console.warn(`  ! 找不到序号 ${item.sequence} 的记录，跳过`);
      continue;
    }
    const uploaded = [];
    for (const file of extracted.get(item.sequence)) {
      try {
        uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
      } catch (error) {
        console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
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
  for (const item of PLAN) {
    const record = verify.find((candidate) => flattenText(candidate.fields?.序号) === item.sequence);
    console.log(`  序号 ${item.sequence}: ${(record?.fields?.APP截图 ?? []).map((a) => a.name ?? a.file_token?.slice(0, 8)).join(', ') || '—'}`);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
