#!/usr/bin/env node
/**
 * T25（AI 安全保护 / 密钥轮换替代路径探测）证据归档：
 *   - issue 15：追加 3 张截图 + 深化回归备注（原始错误码泄漏、追问后 AI 其实能给出安全体检与替代路径）。
 *   - issue 3：追加 1 张截图 + 补充「轮换 = 恢复钱包」的说明。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t25-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t25-evidence.mjs --apply
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';

const ISSUE15_SHOTS = [
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t25-security-alts', 't25-issue15-clarify-choices.jpeg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t25-security-alts', 't25-issue15-raw-not-applicable.jpeg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t25-security-alts', 't25-issue15-safety-report.jpeg'),
];
const ISSUE3_SHOTS = [
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-t25-security-alts', 't25-issue3-restore-path.jpeg'),
];

const ISSUE15_NOTE =
  '【2026-10-14 T25 只读深挖】复现并补充 issue 15：' +
  '1) 失败点 UX 缺口复现：同一意图两次措辞分别返回原始内部动作码错误——' +
  '「secure_this_phone does not apply to this wallet right now · 详情: not_applicable」和' +
  '「restore_wallet does not apply to this wallet right now · 详情: not_applicable」，' +
  '失败点仅给「换个说法再试一次」，无原因、无替代路径。内部动作标识/错误码直接暴露给用户。' +
  '2) 但追问「那我具体该怎么做？有没有其他方式？」后，AI 能给出实质安全体检与可行路径：' +
  '风险等级低·评分100、近7天无异常交易、MPC 2-of-3 门限签名与生物识别授权已启用、' +
  '转账限额由签名服务器把关、防骗提醒（任何人说“服务器停了快导出钥匙”都是骗局）、' +
  '以及「要我帮你再试一次恢复卡片吗？」。说明能力存在，缺口集中在失败点的解释与引导。' +
  '期望：not_applicable 时给出人话原因 + 替代路径（如「当前无旧分片需作废；如需换新手机请走恢复钱包流程」），而非泄漏原始错误码。';

const ISSUE3_NOTE_APPEND =
  '【2026-10-14 T25 只读补充】AI 明确「迁到新手机和轮换密钥，其实是同一条路：恢复一次」——' +
  '恢复后三份钥匙全部换新、旧手机那份作废、拿到一组新的 24 词；' +
  '并解释 why 卡片没生成：「恢复是给新手机用的，你这台已经在正常使用，所以手机判断这一步不适用，才没生成卡片—不是出错」。' +
  '确认：v2 没有独立轮换入口，轮换走恢复钱包流程；失败点原始 not_applicable 错误码的引导仍待优化（同 issue 15）。';

async function appendScreenshots(client, rec, files) {
  const uploaded = [];
  for (const file of files) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  const existing = rec.fields.APP截图 ?? [];
  return [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
}

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 15（reczz28NADvfcEuf）← +${ISSUE15_SHOTS.length} 张 + 深化备注`);
  console.log(`  issue 3（reczz28MNNXaNbKw）← +${ISSUE3_SHOTS.length} 张 + 补充备注`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);

  const rec15 = records.find((r) => flattenText(r.fields.序号) === '15');
  if (rec15) {
    const merged = await appendScreenshots(client, rec15, ISSUE15_SHOTS);
    await client.updateRecord(APP_TOKEN, TABLE_ID, rec15.record_id, {
      回归备注: ISSUE15_NOTE,
      APP截图: merged,
    });
    console.log(`  ✓ issue 15：追加 ${ISSUE15_SHOTS.length} 张（当前 ${merged.length} 张），回归备注已更新`);
  } else {
    console.warn('  ! 找不到 issue 15，跳过');
  }

  const rec3 = records.find((r) => flattenText(r.fields.序号) === '3');
  if (rec3) {
    const merged = await appendScreenshots(client, rec3, ISSUE3_SHOTS);
    const prevNote = typeof rec3.fields.回归备注 === 'string' ? rec3.fields.回归备注 : (rec3.fields.回归备注 ?? []).map((t) => (typeof t === 'string' ? t : t.text)).join('');
    await client.updateRecord(APP_TOKEN, TABLE_ID, rec3.record_id, {
      回归备注: `${prevNote}\n\n${ISSUE3_NOTE_APPEND}`,
      APP截图: merged,
    });
    console.log(`  ✓ issue 3：追加 ${ISSUE3_SHOTS.length} 张（当前 ${merged.length} 张），回归备注追加 T25 补充`);
  } else {
    console.warn('  ! 找不到 issue 3，跳过');
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
