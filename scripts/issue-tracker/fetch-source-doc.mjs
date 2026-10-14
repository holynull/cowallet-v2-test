#!/usr/bin/env node
/**
 * 抓取《Cowallet v2 测试》飞书文档的原文快照，并解析成可导入多维表格的行。
 *
 * 为什么存本地快照：文档随时可能被改，表里的内容要能溯源到某一时刻的原文。
 *
 * 输出：
 *   sources/cowallet-v2-wiki-doc.raw.txt    文档纯文本原文（逐字保存）
 *   sources/cowallet-v2-wiki-doc.rows.json  解析后的行（问题 / 审查说明 / 审查发现 / 结论）
 *
 * 用法：node scripts/issue-tracker/fetch-source-doc.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES_DIR = path.join(ROOT_DIR, 'scripts', 'issue-tracker', 'sources');
const DOC = {
  title: 'Cowallet v2 测试',
  wikiUrl: 'https://catwallet.jp.larksuite.com/wiki/A64bwgzsLi5JNQkgnGrj3Dj0pVb',
  documentId: 'QTPgdOAq1owRtcxnrqRjSBpnpVh',
};

const IMAGE_LINE = /^[0-9a-f]{16,}\.(?:png|jpe?g)$/i;
const ITEM_LINE = /^(\d+)、\s*(.+)$/;
const FINDING_ROW = /^│\s*(\d+)\s*│\s*\S*\s*(HIGH|MEDIUM|LOW)\s*│\s*(.+?)\s*│\s*([\d–\-]+)\s*│\s*(.+?)\s*│?$/;

/** 证据截图在本地文件名 → 与文档里的图片顺序一一对应。 */
const IMAGE_FILES = [
  '01-image.png',
  '02-image.jpg',
  '03-image.png',
  '04-image.png',
  '05-image.png',
];

function parseDoc(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const rows = [];
  let imageIndex = 0;
  let current = null;

  const flush = () => {
    if (current) rows.push(current);
    current = null;
  };

  for (const line of lines) {
    if (!line || line === DOC.title) continue;

    if (IMAGE_LINE.test(line)) {
      const file = IMAGE_FILES[imageIndex];
      imageIndex += 1;
      if (current && file) current.screenshots.push(file);
      continue;
    }

    const item = ITEM_LINE.exec(line);
    if (item) {
      flush();
      const index = Number(item[1]);
      const text = item[2];
      if (index <= 5) {
        const fixed = /已修复/.test(text);
        current = {
          sequence: String(index),
          type: '问题',
          content: `${item[1]}、${text}`,
          docState: fixed ? '已修复' : /未修复/.test(text) ? '未修复' : '未标注',
          level: '',
          codeLocation: '',
          screenshots: [],
          issueRefs: String(index),
        };
      } else {
        // 第 6 条是审查说明：先开一条“审查说明”，后面的表格行与结论分别成行。
        current = {
          sequence: '6',
          type: '审查说明',
          content: `${item[1]}、${text}`,
          docState: '',
          level: '',
          codeLocation: '',
          screenshots: [],
          issueRefs: '6,7,8',
        };
      }
      continue;
    }

    const finding = FINDING_ROW.exec(line);
    if (finding) {
      flush();
      rows.push({
        sequence: `6.${finding[1]}`,
        type: '审查发现',
        content: finding[5],
        docState: '',
        level: finding[2],
        codeLocation: `${finding[3]} ${finding[4]}`,
        screenshots: [],
        issueRefs: String(5 + Number(finding[1])),
      });
      continue;
    }

    if (/^(第一项需要|结论基于)/.test(line)) {
      flush();
      current = {
        sequence: '6',
        type: '结论',
        content: line,
        docState: '',
        level: '',
        codeLocation: '',
        screenshots: [],
        issueRefs: '6,7,8',
      };
      continue;
    }

    if (!current) {
      current = {
        sequence: '6',
        type: '审查说明',
        content: line,
        docState: '',
        level: '',
        codeLocation: '',
        screenshots: [],
        issueRefs: '6,7,8',
      };
      continue;
    }

    current.content = `${current.content}\n${line}`;
  }
  flush();

  // 把“但审查发现了以下问题”这类引导句留在审查说明里即可；
  // 连续两条结论行合并，避免出现只有半句的行。
  const merged = [];
  for (const row of rows) {
    const previous = merged[merged.length - 1];
    if (previous && previous.type === '结论' && row.type === '结论') {
      previous.content = `${previous.content}\n${row.content}`;
      continue;
    }
    merged.push(row);
  }
  return merged;
}

async function main() {
  const token = await getUserToken();
  const client = createClient(token);
  const result = await client.rawGet(
    `/open-apis/docx/v1/documents/${DOC.documentId}/raw_content?lang=0`,
  );
  if (result.code !== 0) {
    throw new Error(`读取文档失败：code=${result.code} msg=${result.msg}`);
  }

  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  const rawPath = path.join(SOURCES_DIR, 'cowallet-v2-wiki-doc.raw.txt');
  fs.writeFileSync(rawPath, result.data.content);

  const rows = parseDoc(result.data.content).map((row) => ({ ...row, source: DOC.title }));
  const rowsPath = path.join(SOURCES_DIR, 'cowallet-v2-wiki-doc.rows.json');
  fs.writeFileSync(
    rowsPath,
    `${JSON.stringify({ doc: DOC, fetchedAt: new Date().toISOString(), rows }, null, 2)}\n`,
  );

  console.log(`文档《${DOC.title}》共 ${rows.length} 行：`);
  for (const row of rows) {
    console.log(
      `  [${row.sequence}] ${row.type}` +
        `${row.level ? ` · ${row.level}` : ''}` +
        `${row.docState ? ` · ${row.docState}` : ''}` +
        `${row.screenshots.length ? ` · 截图 ${row.screenshots.join(',')}` : ''}` +
        ` → Issue ${row.issueRefs}：${row.content.replace(/\n/g, ' ').slice(0, 48)}`,
    );
  }
  console.log(`\n原文快照：${path.relative(ROOT_DIR, rawPath)}`);
  console.log(`解析结果：${path.relative(ROOT_DIR, rowsPath)}`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
