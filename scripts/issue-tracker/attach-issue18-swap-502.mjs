#!/usr/bin/env node
/**
 * Issue 18（OP 兑换失败：错误文案堆叠 + 直接暴露「服务器错误，状态码：502」）记录 + 证据归档。
 *
 * 截图来源：用户提供 ~/Downloads/IMG_4324.PNG（2026-10-15 13:31，新 build 2610141608）。
 * 现象：输入「Op 上 10USDT 换 ETH」→ 助手一次堆叠返回 4 段错误文案
 *   「无法生成计划 / 没法生成这个计划 / 服务器错误，状态码：502 / 暂时没有可用的兑换路线，稍后再试。」
 * 同屏对照组：「arb 上的 0.0045ETH 换 USDT」正常（已提议 → 确认卡 → 兑换计划已发出，等链上确认）。
 * 第 2 例（2026-10-15 14:23 真机实拍 base-eth-usdt-502.png）：同一会话「Base 上的 0.002ETH 换 USDT」→
 *   同样 4 段堆叠含 502 → 502 非 OP 独占；同屏「Base 0.002ETH 换 USDC」报「请求参数错误」（见 issue 20 第 3 例）。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue18-swap-502.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue18-swap-502.mjs --apply
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
const SEQ = '18';

const SHOT_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue18-swap-502');
const SHOTS = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => path.join(SHOT_DIR, f));

const ISSUE = 'OP 上 10 USDT 换 ETH 兑换失败：错误文案堆叠且直接暴露「服务器错误，状态码：502」，无统一失败态与重试/替代引导';

const ISSUE_NOTE =
  '【2026-10-15 13:31 真机（App build 2610141608；用户提供截图）】' +
  '在 AI 聊天里输入「Op 上 10USDT 换 ETH」，助手一次性返回 4 段错误文案：' +
  '「无法生成计划」「没法生成这个计划」「服务器错误，状态码：502」「暂时没有可用的兑换路线，稍后再试。」。' +
  '问题点：① 把后端原始 HTTP 状态码（502）直接暴露给用户，普通用户无法理解；' +
  '② 多条文案语义重复且相互矛盾（「服务器错误」vs「暂时没有可用的兑换路线」），用户无法判断到底发生了什么；' +
  '③ 无重试按钮/替代路径引导，只能自己重新输入。' +
  '同屏对照组：「arb 上的 0.0045ETH 换 USDT」正常生成确认卡并「已发出，等链上确认」→ 非全链路故障，属失败态文案/UX 问题。' +
  '【2026-10-15 14:23 真机复现（同 build；当前屏幕实拍，第 2 张截图）】同一会话输入「Base 上的 0.002ETH 换 USDT」→ ' +
  '返回同样 4 段堆叠（无法生成计划 / 没法生成这个计划 / 服务器错误，状态码：502 / 暂时没有可用的兑换路线，稍后再试。）→ ' +
  '**502 并非 OP 独占，Base 链 ETH→USDT 同样触发**；结合同屏「Base 0.002ETH 换 USDC」报的是「请求参数错误」（见 issue 20 第 3 例）→ ' +
  '后端按「买入资产路由」返回不同错误分类（USDT 买入→502、USDC 买入→参数错误），疑为后端各聚合器/路由的错误映射不一致，需后端定位。';

const IMPACT =
  '中。兑换失败时用户收到无法理解的错误堆叠（含原始 502），无法判断是余额/路线/服务器问题，也无法直接重试；' +
  '若 502 为服务端瞬时故障，用户可能误以为「没有可兑换路线」而放弃。不符合「失败态文案应可理解、失败应有出口」的预期。';

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
