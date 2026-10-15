#!/usr/bin/env node
/**
 * Issue 20（「0.007bnb 换 USDT」兑换失败：堆叠文案含「请求参数错误」，无明确原因与重试/替代引导）记录 + 证据归档。
 *
 * 截图来源：用户提供 ~/Downloads/IMG_4326.PNG（2026-10-15 13:49，新 build 2610141608）。
 * 现象：输入「0.007bnb 换 USDT」→ 助手堆叠返回
 *   「无法生成计划 / 没法生成这个计划 / 请求参数错误 / 暂时没有可用的兑换路线，稍后再试。」
 * 与 issue 18（OP 10USDT→ETH，暴露「服务器错误，状态码：502」）同属「失败态文案堆叠」家族，但根因不同（请求参数错误）。
 * 同屏对照组：ARB 10 USDT→ETH 第二次执行，AI 已主动提议查订单是否真正到账（对应 issue 19 的正向改善）。
 * 第 3 例（2026-10-15 14:23 真机实拍 base-eth-usdc-param-error.png）：同一会话「Base 上的 0.002ETH 换 USDC」→
 *   同样「请求参数错误」堆叠 → 该错误不局限于 BSC；同屏「Base 0.002ETH 换 USDT」报「服务器错误，状态码：502」（见 issue 18 第 2 例）。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue20-bnb-param-error.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue20-bnb-param-error.mjs --apply
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
const SEQ = '20';

const SHOT_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue20-bnb-param-error');
const SHOTS = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => path.join(SHOT_DIR, f));

const ISSUE = '「0.007bnb 换 USDT」兑换失败：堆叠文案含「请求参数错误」，无明确原因与重试/替代引导';

const ISSUE_NOTE =
  '【2026-10-15 13:49 真机（App build 2610141608；用户提供截图）】' +
  '在 AI 聊天输入「0.007bnb 换 USDT」（BNB→USDT，未指明链，默认 BSC），助手一次性返回 4 段堆叠错误文案：' +
  '「无法生成计划」「没法生成这个计划」「请求参数错误」「暂时没有可用的兑换路线，稍后再试。」。' +
  '问题点：① 把后端「请求参数错误」这类内部错误直接抛给用户，普通用户无法理解；' +
  '② 多条文案语义重复且矛盾（「请求参数错误」vs「没有可用的兑换路线」），无法判断是参数/余额/路线哪个环节失败；' +
  '③ 无重试按钮/替代路径引导。' +
  '与 issue 18（OP 10USDT→ETH，暴露「服务器错误，状态码：502」）同属「失败态文案堆叠、无出口」UX 家族，但本单根因是「请求参数错误」——' +
  '【2026-10-15 13:58 复现（同 build；当前屏幕实拍，第 2 张截图）】输入「bsc 上全部 USDT 换 bnb」（USDT→BNB，明确指定链 + 全部金额 + 方向与 0.007bnb 相反）' +
  '**仍返回同一条「请求参数错误」堆叠** → 可排除「小写/未指明链/金额过小」假设，疑似 BSC 上 BNB↔USDT 双向兑换路径的参数校验/静态 symbol 映射问题（如对「bnb」小写不识别）。需后端定位。' +
  '同屏对照组：ARB 10 USDT→ETH 第二次执行后，AI 已主动提议「要不要我查一下这笔订单有没有真正到账？（上次就是执行了但被退款…）」——对应 issue 19 的正向改善。' +
  '【2026-10-15 14:23 真机复现（同 build；当前屏幕实拍，第 3 张截图）】同一会话输入「Base 上的 0.002ETH 换 USDC」' +
  '（Base 链 ETH→USDC，与 BSC/BNB 无关）→ **仍返回「请求参数错误」堆叠** → 该错误**不局限于 BSC**，原「BSC BNB↔USDT 路径/小写 symbol 映射」假设需放宽。' +
  '结合同屏「Base 0.002ETH 换 USDT」报「服务器错误，状态码：502」（见 issue 18 第 2 例）→ ' +
  '后端按「买入资产路由」返回不同错误分类（USDC 买入→参数错误、USDT 买入→502），疑为后端各聚合器/路由错误映射不一致，需后端定位。';

const IMPACT =
  '中。兑换失败时用户收到无法理解的错误堆叠（含「请求参数错误」），无法判断失败环节，也无直接重试出口；' +
  'BNB 类非 ETH native 代币或小写币名路径更易踩到参数解析失败，用户可能误以为「没有可兑换路线」而放弃。';

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
