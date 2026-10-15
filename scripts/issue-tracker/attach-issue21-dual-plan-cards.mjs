#!/usr/bin/env node
/**
 * Issue 21（新对话单条兑换请求出现两张并存计划卡：旧卡自动被取代但不清理）记录 + 证据归档。
 *
 * 现象（2026-10-15 14:14-14:18 真机，build 2610141608）：
 *   用户新开一个对话，只输入一条「Base 上的全部 USDC 换成 ETH」并发送（未点击任何刷新/再次报价/重试按钮），
 *   对话里同时出现两张「兑换计划」卡：
 *     - 旧卡 c299acdf：标注「已被计划 a80e920f 取代 / 已过期」
 *     - 新卡 a80e920f：当前生效（有倒计时 + 取消 / 用 Face ID 批准）
 *   会话历史确认该新对话（标题「Base 上的全部 USDC 换成 ETH」，3 分钟前）与旧会话并存，共 3 个会话。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue21-dual-plan-cards.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue21-dual-plan-cards.mjs --apply
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
const SEQ = '21';

const SHOT_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue21-dual-plan-cards');
const SHOTS = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => path.join(SHOT_DIR, f));

const ISSUE = '新对话单条兑换请求出现两张并存「兑换计划」卡：旧卡自动被新卡取代但不清理，未点任何按钮即冒第二张卡';

const ISSUE_NOTE =
  '【2026-10-15 14:14-14:18 真机（App build 2610141608）】' +
  '用户新开一个对话，仅输入并发送一条「Base 上的全部 USDC 换成 ETH」（未点击任何刷新/再次报价/重试按钮），' +
  '对话内同时出现两张「兑换计划」卡：' +
  '① 旧卡 c299acdf：标注「已被计划 a80e920f 取代 / 已过期」；' +
  '② 新卡 a80e920f：当前生效（含倒计时、签名额度、Face ID 批准等完整字段）。' +
  '问题点：① 单条请求未触发任何操作却产生第二张卡（报价被自动取代/刷新），旧卡不清理，两张卡并存让用户困惑「哪张才是有效的」；' +
  '② 财务操作确认区双卡并存，可能误点已过期旧卡（旧卡虽标「已过期」，但视觉上仍是完整确认卡）。' +
  '会话历史：该新对话（标题「Base 上的全部 USDC 换成 ETH」，3 分钟前）与旧会话（op 上 10USDT 换 ETH）及幽灵会话（帮我转 0.01 ETH 给小明）并存。' +
  '与 issue 19 观察到的「计划被取代/过期」同源，但本单重点是「未点按钮即自动冒第二张卡 + 旧卡不清理」。';

const IMPACT =
  '低-中。兑换确认区出现两张并存计划卡（一旧一新），用户需自行辨认哪张有效；旧卡仍显示为完整确认卡，存在误按/误读风险；' +
  '新对话「没点按钮就冒第二张卡」也让用户疑惑是否已自动发起操作。不直接影响资金（旧卡已标记过期、未自动执行）。';

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
