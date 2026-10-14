#!/usr/bin/env node
/**
 * 把飞书 Issue list 表拉成本地只读快照，供跨会话快速查阅。
 *
 * 背景：测试会跨多个会话进行；飞书 Base 是唯一事实源，但新会话要打开飞书才能看。
 * 本脚本把关键列落盘到 docs/issue-tracker/issue-status.md，任何会话读一个本地文件即可。
 *
 * 用法：
 *   node scripts/issue-tracker/snapshot-issues.mjs
 *
 * 说明：
 *   - 只读（不写飞书）；需要有效 user token（bitable:app），过期先跑 authorize-lark.mjs。
 *   - 输出覆盖 docs/issue-tracker/issue-status.md（始终是最新一次快照）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';
const OUT = path.join(ROOT_DIR, 'docs', 'issue-tracker', 'issue-status.md');

function truncate(value, max = 160) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function main() {
  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rows = records
    .map((r) => {
      const f = r.fields;
      return {
        seq: Number(flattenText(f.序号)) || 0,
        issue: flattenText(f.Issue),
        type: flattenText(f.问题类型),
        platform: flattenText(f.平台),
        severity: flattenText(f.严重程度),
        docStatus: flattenText(f.文档标注状态),
        regression: flattenText(f.回归验证状态),
        feedback: flattenText(f.反馈状态),
        category: flattenText(f.问题归类),
        regressionNote: truncate(flattenText(f.回归备注), 180),
        shotCount: Array.isArray(f.APP截图) ? f.APP截图.length : 0,
        recordId: r.record_id,
      };
    })
    .sort((a, b) => a.seq - b.seq);

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const lines = [];
  lines.push('# CoWallet v2 Issue 状态快照（本地只读）');
  lines.push('');
  lines.push(`> 生成时间：${now}（Asia/Shanghai）`);
  lines.push('> 唯一事实源：飞书 Base `QVGLbx4zIauLNxsxPZYjHvSbpUh` / `tblQSxhJi3fb4ml7`（https://catwallet.jp.larksuite.com/base/QVGLbx4zIauLNxsxPZYjHvSbpUh）');
  lines.push('> 本文件仅作跨会话快速查阅；刷新：`node scripts/issue-tracker/snapshot-issues.mjs`');
  lines.push('');
  lines.push(`共 ${rows.length} 条记录。`);
  lines.push('');
  lines.push('| 序号 | Issue | 严重程度 | 文档标注 | 回归验证状态 | 反馈状态 | 截图 | 回归备注（截断） |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(
      `| ${r.seq || '—'} | ${r.issue} | ${r.severity || '—'} | ${r.docStatus || '—'} | ${r.regression || '—'} | ${r.feedback || '—'} | ${r.shotCount} | ${r.regressionNote || '—'} |`,
    );
  }
  lines.push('');
  lines.push('> 详细回归备注/全部截图请到飞书表查看。record_id 映射见脚本输出（未落盘）。');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`✓ 已写 ${rows.length} 条快照 → ${path.relative(ROOT_DIR, OUT)}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
