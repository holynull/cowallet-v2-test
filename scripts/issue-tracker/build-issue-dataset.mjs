#!/usr/bin/env node
/**
 * 把散落在各处的 issue 材料抽取成一份结构化数据集，用于导入飞书多维表格（Bitable）。
 *
 * 数据来源：
 *   A. ../cowallet/blackbox-device-tests/findings/*.md        —— v1.0.2 真机发现的原始记录（带 Linear 号）
 *   B. ../midscene-test-cowallet/issue_reports/cowallet-ux-issues/cowallet-ux-issues-combined.csv
 *                                                              —— v1 Android UX 巡检 18 条
 *   C. ./sources/cowallet-v2-wiki-items.json                   —— 「Cowallet v2 测试」文档里的 v2 问题（人工录入）
 *
 * 输出：
 *   dist/cowallet-issues.json   完整数据（含每个字段的原始值，供 API 写入使用）
 *   dist/cowallet-issues.csv    可直接在飞书多维表格里「导入表格」使用
 *
 * 只读本地文件，不写远端。
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIBLING = path.resolve(ROOT_DIR, '..');
const FINDINGS_DIR = path.join(SIBLING, 'cowallet', 'blackbox-device-tests', 'findings');
const UX_CSV = path.join(
  SIBLING,
  'midscene-test-cowallet',
  'issue_reports',
  'cowallet-ux-issues',
  'cowallet-ux-issues-combined.csv',
);
const V2_ITEMS = path.join(ROOT_DIR, 'scripts', 'issue-tracker', 'sources', 'cowallet-v2-wiki-items.json');
const DIST_DIR = path.join(ROOT_DIR, 'scripts', 'issue-tracker', 'dist');

/**
 * 这些文件不是新的问题，而是提交草稿/汇总稿（内容与其它 findings 重复），
 * 或者只是测试小结；纳入会造成重复行。
 */
const EXCLUDED_FINDINGS_FILES = new Set([
  'ai-reported-issues-2026-07-29.md',
  'linear-english-language-issues-2026-07-30.md',
  'github-upstream-issue-drafts-2026-07-29.md',
  '2026-08-13-v102-test-focus-results-and-manual-checks.md',
  'README.md',
  'index.md',
  'linear-issue-template.md',
]);

const CSV_COLUMNS = [
  '序号',
  'Issue',
  '问题类型',
  '平台',
  '严重程度',
  '文档标注状态',
  '代码位置',
  '问题详情',
  '影响',
  '问题归类',
  '反馈状态',
  '反馈备注',
  '回归验证状态',
  '回归备注',
  '证据截图（本地路径，需通过 API 上传为附件）',
  '发现版本',
  '来源',
  'Linear/工单',
];

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, '\\n')}"`;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.sequence,
        row.title,
        row.category === '安全审查' ? '代码审查' : '功能问题',
        row.platforms.join('/'),
        row.severity,
        row.docState ?? '',
        row.codeLocation ?? '',
        row.detail,
        row.impact,
        row.category,
        row.issueStatus,
        row.devNote,
        row.regressionStatus,
        row.regressionNote,
        row.evidence.join('; '),
        row.foundInVersion,
        row.source,
        row.ticket,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

const ID_HEADING = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{1,3})\s*[:：]\s*(.+)$/;
const FINDING_HEADING = /^Finding\s+(\d+)\s*[:：]\s*(.+)$/i;

/**
 * 从 findings markdown 里抽取 issue。
 *
 * 现有文件有三种写法，都要覆盖：
 *   A. `## IOS-001: 标题`（每条问题一个 H2）
 *   B. `# IOS-V102-BACKUP-001: 标题` + 紧跟 Status/Linear/Priority（一个文件一条问题）
 *   C. `## Finding 1: 标题`（无 ID，用文件名生成）
 * 其它 `## Observed` / `## Expected` 之类的段落标题不是 issue，必须排除。
 */
function parseFindings(markdown, fileName) {
  const lines = markdown.split(/\r?\n/);
  const fileStem = fileName.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').toUpperCase();
  const items = [];
  let current = null;

  const push = () => {
    if (current && current.title) items.push(current);
    current = null;
  };

  for (const line of lines) {
    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const raw = heading[2].trim();
      const idMatch = ID_HEADING.exec(raw);
      const findingMatch = FINDING_HEADING.exec(raw);
      if (idMatch) {
        push();
        current = { findingId: idMatch[1], title: idMatch[2].trim() };
      } else if (findingMatch) {
        push();
        current = { findingId: `${fileStem}-F${findingMatch[1]}`, title: findingMatch[2].trim() };
      } else if (level === 1 && items.length === 0 && !current) {
        // 候选：单条问题的文件用 H1 当标题；后面如果解析出 Status 就保留。
        current = { findingId: fileStem, title: raw, h1Candidate: true };
      } else {
        // 段落标题：结束当前问题，避免把正文段落当成新问题。
        push();
      }
      continue;
    }
    if (!current) continue;
    const status = /^Status:\s*(.+)$/.exec(line);
    if (status) {
      current.status = status[1].trim();
      continue;
    }
    const linear = /^Linear:\s*(.+)$/.exec(line);
    if (linear) {
      current.linear = linear[1].trim();
      continue;
    }
    const priority = /^Priority:\s*(.+)$/.exec(line);
    if (priority) current.priority = priority[1].trim();
    const evidence = /^-\s+`([^`]+\.(?:png|jpg|jpeg|webp|gif))`\s*$/i.exec(line.trim());
    if (evidence) {
      current.evidence = current.evidence ?? [];
      current.evidence.push(evidence[1]);
    }
  }
  push();

  // H1 候选只有在这份文件没有解析出其它条目、且带元数据时才算真实问题。
  return items
    .filter((item) => !item.h1Candidate || (items.length === 1 && item.status))
    .map((item) => ({ ...item, file: fileName }));
}

function severityFromPriority(priority) {
  const normalized = (priority ?? '').toLowerCase();
  if (normalized.startsWith('high') || normalized.includes('blocker')) return '高';
  if (normalized.startsWith('medium')) return '中';
  if (normalized.startsWith('low')) return '低';
  return '';
}

function sourceFromFindings(fileName) {
  return /android/i.test(fileName) ? '人工真机探索（Android）' : '人工真机探索（iOS）';
}

async function loadFindingsRows() {
  const names = (await readdir(FINDINGS_DIR)).filter((name) => name.endsWith('.md'));
  const rows = [];
  for (const name of names) {
    if (EXCLUDED_FINDINGS_FILES.has(name)) continue;
    const markdown = await readFile(path.join(FINDINGS_DIR, name), 'utf8');
    for (const item of parseFindings(markdown, name)) {
      rows.push({
        title: item.title,
        detail: `来源文件：blackbox-device-tests/findings/${name}`,
        impact: '',
        platforms: [/android/i.test(name) ? 'Android' : 'iOS'],
        severity: severityFromPriority(item.priority),
        category: '交互与文案',
        foundInVersion: name.startsWith('2026-08-') || name.startsWith('2026-09') ? 'v1.0.2' : 'v1.0.x',
        source: sourceFromFindings(name),
        issueStatus: item.linear && item.linear !== 'pending' ? '已提交工单' : '待反馈',
        devNote: item.linear && item.linear !== 'pending' ? `Linear: ${item.linear}` : '',
        regressionStatus: '待确认',
        regressionNote: '',
        evidence: (item.evidence ?? []).map(
          (value) => `cowallet/blackbox-device-tests/findings/${value}`,
        ),
        ticket: item.linear && item.linear !== 'pending' ? item.linear : '',
        findingId: item.findingId,
      });
    }
  }
  return rows;
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}

async function loadUxRows() {
  const text = await readFile(UX_CSV, 'utf8');
  const [header, ...records] = parseCsv(text);
  const titleIndex = header.indexOf('问题描述');
  const screenshotIndex = header.indexOf('截图');
  const impactIndex = header.indexOf('影响和建议');
  const rows = [];
  for (const record of records) {
    const description = (record[titleIndex] ?? '').trim();
    if (!description) continue;
    const idMatch = /^(ISSUE-\d+)[：:]\s*(.*)$/s.exec(description);
    const evidence = (record[screenshotIndex] ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value && value !== '无截图')
      .map((value) => `midscene-test-cowallet/${value}`);
    rows.push({
      title: (idMatch ? idMatch[2] : description).split('\n')[0].slice(0, 120),
      detail: description,
      impact: record[impactIndex] ?? '',
      platforms: ['Android'],
      severity: '',
      category: '产品缺陷',
      foundInVersion: 'v1（Android UX 巡检 2026-07-08）',
      source: '人工真机探索（Android）',
      issueStatus: '待反馈',
      devNote: '',
      regressionStatus: '待确认',
      regressionNote: '',
      evidence,
      ticket: '',
      findingId: idMatch ? idMatch[1] : '',
    });
  }
  return rows;
}

async function loadV2Rows() {
  const items = JSON.parse(await readFile(V2_ITEMS, 'utf8'));
  return items.map((item) => ({
    platforms: [],
    evidence: [],
    ticket: '',
    ...item,
  }));
}

async function main() {
  const [v2Rows, uxRows, findingRows] = await Promise.all([
    loadV2Rows(),
    loadUxRows(),
    loadFindingsRows(),
  ]);

  const rows = [...v2Rows, ...uxRows, ...findingRows].map((row, index) => ({
    ...row,
    sequence: String(index + 1),
  }));

  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(
    path.join(DIST_DIR, 'cowallet-issues.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 2)}\n`,
  );
  await writeFile(path.join(DIST_DIR, 'cowallet-issues.csv'), `\uFEFF${toCsv(rows)}`);

  // 新多维表格里只放《Cowallet v2 测试》文档的内容，同步导出一份对应的 csv/json。
  const v2OnlyRows = rows.filter((row) => row.foundInVersion?.startsWith('v2'));
  await writeFile(
    path.join(DIST_DIR, 'cowallet-v2-issues.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), count: v2OnlyRows.length, rows: v2OnlyRows }, null, 2)}\n`,
  );
  await writeFile(path.join(DIST_DIR, 'cowallet-v2-issues.csv'), `\uFEFF${toCsv(v2OnlyRows)}`);

  const bySource = rows.reduce((accumulator, row) => {
    accumulator[row.source] = (accumulator[row.source] ?? 0) + 1;
    return accumulator;
  }, {});

  console.log(`总计 ${rows.length} 条 issue`);
  for (const [source, count] of Object.entries(bySource)) console.log(`  ${source}: ${count}`);
  console.log(`\n输出目录：${path.relative(ROOT_DIR, DIST_DIR)}`);
  console.log(`  cowallet-issues.json / .csv（全部 ${rows.length} 条，历史留档）`);
  console.log(`  cowallet-v2-issues.json / .csv（仅文档内容 ${v2OnlyRows.length} 条，对齐新多维表格结构）`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
