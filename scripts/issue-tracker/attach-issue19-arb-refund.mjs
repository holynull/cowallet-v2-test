#!/usr/bin/env node
/**
 * Issue 19（ARB 10 USDT→ETH 兑换：源链上链后 AI 误报「已换成 ETH」，实际订单 refunded 退款）记录 + 证据归档。
 *
 * 截图来源：用户提供 ~/Downloads/IMG_4325.PNG（2026-10-15 13:42，新 build 2610141608）。
 * 现象：
 *   1) 输入兑换 Arbitrum 10 USDT → ETH：AI 先报「已确认…已经上链。交易 0x7765cac5…」，
 *      随后直接宣称「兑换已执行 ✓ Arbitrum 上10 USDT 已换成 ETH」；
 *   2) 用户追问「兑换成功了吗」→ AI 查订单（kgr4eknk..rqru5t0）后改口：
 *      「没换成，USDT 已经原路退回。订单状态是 refunded（refund_complete）—源链那笔交易提交了，
 *      但兑换没完成，10 USDT 退回了你的 Arbitrum 钱包。」
 * 失败诱因（用户经验）：滑点设 0.5% 偏低，订单兑换未完成被 Bridgers 退款；默认 1% 成功率更高。
 * 第 2 例（2026-10-15 14:48 真机实拍 eth-all-usdt-to-eth-refund-conv.png）：Ethereum 主网 10.781667 USDT→ETH 真实执行后
 *   同模式复现：AI 先报「兑换已完成/已上链」，用户追问「到账了吗」后才承认 refund_complete 退款 → 跨链（ARB+ETH）复现。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue19-arb-refund.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue19-arb-refund.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';
const SEQ = '19';

const SHOT_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue19-arb-refund');
const SHOTS = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => path.join(SHOT_DIR, f));

const ISSUE = 'ARB 10 USDT→ETH 兑换源链上链后 AI 误报「已换成 ETH」，实际订单 refunded 退款，需用户追问才暴露';

const ISSUE_NOTE =
  '【2026-10-15 13:42 真机（App build 2610141608；用户提供截图）】' +
  '兑换 Arbitrum 10 USDT → ETH：AI 先回复「✓ 已确认：Arbitrum 上的10 USDT→ETH 已经上链。交易 0x7765cac5…」，' +
  '随后直接宣称「兑换已执行 ✓ Arbitrum 上10 USDT 已换成 ETH。还要做点啥吗？」。' +
  '用户追问「兑换成功了吗」后，AI 查订单（kgr4eknk..rqru5t0）改口：' +
  '「没换成，USDT 已经原路退回。订单状态是 refunded（refund_complete）—源链那笔交易提交了，但兑换没完成，10 USDT 退回了你的 Arbitrum 钱包。」。' +
  '问题点：① 结果卡/AI 回复在源链 tx 上链后即宣称「已换成 ETH」，与实际订单终态（refunded）不一致——' +
  '违反「结果卡不能只因源链 tx confirmed 就显示最终兑换成功」的终态口径；' +
  '② 用户需主动追问才得知失败退款，无主动的失败/退款提示或终态回查通知。' +
  '失败诱因（用户经验）：滑点设为 0.5% 偏低，兑换未完成被 Bridgers 退款（refund_complete），默认 1% 成功率更高；' +
  '需产品确认滑点默认值/可选项、以及失败退款是否应主动通知。' +
  '【2026-10-15 14:48 真机复现（同 build；Ethereum 主网，第 2 例，真实执行+Face ID 用户手动）】' +
  '用户输入「以太坊上 全部 USDT 换成 ETH」并真实执行：计划 35bf6c06 执行（授权路由合约 0x498b..f9b2 / 兑换 0x018c3964...10ca88，已确认 34 个区块）；' +
  'AI 先报「兑换已完成 — 卖出 10.781667 USDT，换成了 ETH，已完成。」与「已确认：Ethereum 上的 10.781667 USDT→ETH 已经上链。交易 0x018c3964⋯10ca88」；' +
  '用户追问「到账了吗？」→ AI 改口「这笔没换成 — 订单状态是已退款（refund_complete），USDT 已经退回你的钱包，ETH 没到账。」。' +
  '→ 与第 1 例（ARB）同模式：**源链 tx confirmed 即误报成功、失败退款需用户主动追问才暴露**，跨链复现（Arbitrum + Ethereum 主网），' +
  '非 ARB 独有，属「结果终态口径 + 失败退款主动通知」的全局问题；失败诱因仍疑滑点 0.5% 偏低（Bridgers 退款）。';

const IMPACT =
  '中。源链 tx 上链后即误报成功，用户可能误以为已持有 ETH；实际 USDT 已原路退回，但需用户主动追问订单状态才能发现失败退款。' +
  '资金无损（已退回），主要是一致性与主动通知缺口：真实资金操作的成功/失败应一次说清并主动回查终态。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue ${SEQ}（新增）← ${SHOTS.length} 张证据截图`);
  console.log(`  截图：${SHOTS.map((f) => path.basename(f)).join(', ') || '（无）'}`);
  if (!APPLY) {
    console.log('\n加 --apply 才会写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  let rec = records.find((r) => flattenText(r.fields.序号) === SEQ);

  if (!rec) {
    const created = await client.batchCreate(APP_TOKEN, TABLE_ID, [
      {
        序号: SEQ,
        Issue: ISSUE,
        问题类型: '功能问题',
        平台: 'iOS',
        严重程度: '中',
        文档标注状态: '未标注',
        Issue备注: ISSUE_NOTE,
        影响: IMPACT,
        反馈状态: '待反馈',
        回归验证状态: '待确认',
      },
    ]);
    console.log(`  ✓ 已创建 issue ${SEQ}`);
    rec = { record_id: created?.[0]?.record_id };
    if (!rec.record_id) {
      rec = (await client.listAllRecords(APP_TOKEN, TABLE_ID)).find(
        (r) => flattenText(r.fields.序号) === SEQ,
      );
    }
  } else {
    console.log(`  ✓ issue ${SEQ} 已存在（${rec.record_id}），改为追加`);
  }
  if (!rec.record_id) throw new Error('创建/定位 issue 记录失败');

  const uploaded = [];
  for (const file of SHOTS) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  const existing = rec.fields?.APP截图 ?? [];
  const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
  await client.updateRecord(APP_TOKEN, TABLE_ID, rec.record_id, {
    Issue备注: ISSUE_NOTE,
    影响: IMPACT,
    反馈状态: '待反馈',
    回归验证状态: '待确认',
    APP截图: merged,
  });
  console.log(`  ✓ issue ${SEQ} 已写入：${uploaded.length} 张截图（当前 ${merged.length} 张）`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
