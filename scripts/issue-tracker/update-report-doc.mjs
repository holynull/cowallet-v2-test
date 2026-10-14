#!/usr/bin/env node
/**
 * 更新飞书测试报告文档中 issue 3 的两处内容（结论纠错）。
 *
 * 背景：测试报告早前断言「v2 无独立轮换入口，轮换=恢复」有误。
 * 2026-10-14 证实设置 → 密钥安全 →「轮换密钥分片」存在独立入口（「换一套新钥匙」页）。
 * 更新飞书文档 SXCEdr07AoAgNEx58qKjhlTPpPe 中：
 *   - 5. 缺陷总览 表格 issue 3 行「回归验证」单元格（block doxjpcXU7Q9LfefZLFW38pgnPmU）
 *   - 6.2 部分通过 issue 3 要点（block doxjptaiRsELS7KbwtMLBISWdkc，保留「Issue 3（轮换密钥）」加粗）
 *
 * 用法：
 *   node scripts/issue-tracker/update-report-doc.mjs        # dry-run
 *   node scripts/issue-tracker/update-report-doc.mjs --apply
 */

import { createClient, getUserToken } from './lib/lark.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const DOC_ID = 'SXCEdr07AoAgNEx58qKjhlTPpPe';

const CELL_TEXT = '🟡 待确认（入口存在：设置→密钥安全→「换一套新钥匙」；实际执行未实测）';

const BULLET_RUNS = [
  { text_run: { content: 'Issue 3（轮换密钥）', text_element_style: { bold: true } } },
  {
    text_run: {
      content:
        '：结论更正——v2 存在独立密钥轮换入口（设置 → 密钥安全 → 「轮换密钥分片（上次轮换: 从未）」），' +
        '轮换页「换一套新钥匙」说明完整：手机/服务器/备份三份全换新、钱包地址不变、给新 24 词旧作废、' +
        'Face ID 双确认、反诈提示，按钮「开始换钥匙」（执行边界，未点）/「先不换」。' +
        '此前「v2 无独立轮换入口」的判断有误，已更正。实际执行换钥匙未授权测试（不可逆）；' +
        'AI「保护这台手机」not_applicable 属 issue 15 独立问题。',
    },
  },
];

async function main() {
  console.log(`文档：${DOC_ID}`);
  console.log(`  1) 缺陷总览表格 issue 3「回归验证」单元格 ← ${JSON.stringify(CELL_TEXT)}`);
  console.log(`  2) 6.2 部分通过 issue 3 要点 ← ${BULLET_RUNS[1].text_run.content.slice(0, 60)}…`);
  if (!APPLY) {
    console.log('\n加 --apply 才会写入。');
    return;
  }

  const client = createClient(await getUserToken());

  const cell = await client.rawGet(`/open-apis/docx/v1/documents/${DOC_ID}/blocks/doxjpcXU7Q9LfefZLFW38pgnPmU`);
  if (cell.code !== 0) throw new Error(`读取单元格失败：${JSON.stringify(cell)}`);
  const cellPatch = await client.rawPatch(`/open-apis/docx/v1/documents/${DOC_ID}/blocks/doxjpcXU7Q9LfefZLFW38pgnPmU`, {
    update_text_elements: { elements: [{ text_run: { content: CELL_TEXT } }] },
  });
  if (cellPatch.code !== 0) throw new Error(`更新单元格失败：${JSON.stringify(cellPatch)}`);
  console.log('  ✓ 单元格已更新');

  const bulletPatch = await client.rawPatch(
    `/open-apis/docx/v1/documents/${DOC_ID}/blocks/doxjptaiRsELS7KbwtMLBISWdkc`,
    { update_text_elements: { elements: BULLET_RUNS } },
  );
  if (bulletPatch.code !== 0) throw new Error(`更新要点失败：${JSON.stringify(bulletPatch)}`);
  console.log('  ✓ 6.2 要点已更新');
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
