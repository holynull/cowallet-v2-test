#!/usr/bin/env node
/**
 * T19（真实 ETH 转账）证据归档：
 *  - issue 5「ETH 转账失败」→ 追加回归证据（转账成功 + tx hash + 余额），更新回归备注/状态
 *  - issue 1「收款无消息提示」→ 追加 2 张真机截图
 *  - 新增 issue 14「确认卡不显示完整收款地址」→ 附 2 张截图
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t19-evidence.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t19-evidence.mjs --apply
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

const ASSETS = path.join(ROOT_DIR, 'findings', 'assets');

const ISSUE5_SCREENSHOTS = [
  path.join(ASSETS, 'feishu-issue5-regression', 't19-transfer-confirmed-tx-0x31af.jpg'),
  path.join(ASSETS, 'feishu-issue5-regression', 't19-wallet-after-0.001478.jpg'),
];
const ISSUE1_SCREENSHOTS = [
  path.join(ASSETS, 'feishu-issue1-notify', 't19-home-5.02-no-notify.jpg'),
  path.join(ASSETS, 'feishu-issue1-notify', 't19-wallet-5.02-no-notify.jpg'),
];
const ISSUE14_SCREENSHOTS = [
  path.join(ASSETS, 'feishu-issue14-confirm-card', 't19-card-chat-shows-addr.jpg'),
  path.join(ASSETS, 'feishu-issue14-confirm-card', 't19-card-no-addr-on-card.jpg'),
];

const ISSUE5_REGRESSION_NOTE =
  '【2026-10-14 真实转账回归】用户明确授权的一笔真实转账（收款地址 0x75276A6E673B4083b640956262605955F11D767B，' +
  '已写入 .env TEST_SAFE_EVM_RECEIVER；金额 0.0005 ETH · Ethereum 主网）全链路成功：确认卡（金额 ≤ 0.00052815 ETH、' +
  '手续费最多 0.00002815 ETH）→ 尾 4 字符 + Face ID（用户手动）→ 广播 → 已确认（0 个区块）。' +
  '交易 0x31af0845b765b36cc2d3db9a1471cfe42b24280c1af01fd78713e059561480fa（Ethereum · 10/14 11:31）。' +
  '余额 0.002000 → 0.001478 ETH（0.0005 + ~0.000022 gas，与卡片预估吻合）；总资产 $5.03 → $3.72。' +
  '结论：RPC 正常时转账主路径可用；原始 issue 的「chain_unreachable / 状态矛盾」异常路径本轮未复现，' +
  '归因更精确应为「RPC/后端链上数据不可用时的状态一致性问题」，仍需在 RPC 故障时复测。';

const ISSUE1_EVIDENCE_NOTE =
  '【2026-10-14 真机补证】账户余额 $5.02（ETH 0.002000）时，首页（「你的总资产 $5.02」）与钱包 tab（「总资产 $5.02 · ETH 0.002000」）' +
  '均无任何到账/收款提示（无横幅、无消息、无红点），用户只能自行打开资产页核对余额确认到账。';

const ISSUE14_FIELDS = {
  序号: '14',
  Issue: '转账确认卡不显示完整收款地址，只能输入尾 4 字符核对，聊天消息滚出屏幕后无法在卡上核对',
  问题类型: '功能问题',
  平台: 'iOS',
  严重程度: '中',
  文档标注状态: '未标注',
  问题归类: '产品缺陷',
  Issue备注:
    '真机观察（app.getcowallet.wallet v1.0.2 build 2610121802，iOS 真机 T19 真实转账流程）：' +
    '对「向 0x75276A6E673B4083b640956262605955F11D767B 转 0.0005 ETH」的真实转账，确认卡正文只显示' +
    '「你粘贴或输入的地址」标签 + 输入框提示「请输入上面地址的最后 4 个字符才能批准」，**卡片本身不渲染完整的收款地址值**。' +
    '双重防护 = 输入地址尾 4 字符 + Face ID 批准。\n' +
    '来源：reports/2026-10-14T03-19-40-798Z-t19-real-transfer-eth-ios/summary.json（recipientOnCard: null，' +
    '首轮断言 failed-address-mismatch 系脚本误报，经 OCR 核实聊天消息地址为 0x75276A6E673B4083b640956262605955F11D767B，' +
    '确认卡正文确实不渲染地址值）。\n' +
    '发现版本：v2（TestFlight 构建 2610121802）\n' +
    '来源：iOS 真机 T19',
  影响:
    '中。若包含地址的聊天消息已滚出屏幕，用户在批准前无法在确认卡上核对收款地址，只能依赖输入尾 4 字符的一致性判断，' +
    '存在转错地址的安全 UX 隐患。尾 4 字符 + Face ID 的双重防护本身是好的，但卡上缺地址值降低了可核对性。',
  反馈状态: '待反馈',
  回归验证状态: '待确认',
};

async function uploadAll(client, files) {
  const uploaded = [];
  for (const file of files) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  return uploaded;
}

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 5（reczz28MNNXaMD4s）← 追加 ${ISSUE5_SCREENSHOTS.length} 张回归截图 + 回归备注`);
  console.log(`  issue 1（reczz28MNNXaNcQw）← 追加 ${ISSUE1_SCREENSHOTS.length} 张截图 + 备注`);
  console.log(`  新增 issue 14 ← ${ISSUE14_SCREENSHOTS.length} 张截图`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);

  // ---- issue 5 回归 ----
  const rec5 = records.find((r) => flattenText(r.fields.序号) === '5');
  if (!rec5) {
    console.warn('  ! 找不到序号 5，跳过');
  } else {
    const up = await uploadAll(client, ISSUE5_SCREENSHOTS);
    const existing = rec5.fields.APP截图 ?? [];
    const merged = [...existing.map(({ file_token }) => ({ file_token })), ...up];
    await client.updateRecord(APP_TOKEN, TABLE_ID, rec5.record_id, {
      回归验证状态: '部分通过',
      回归备注: ISSUE5_REGRESSION_NOTE,
      APP截图: merged,
    });
    console.log(`  ✓ 序号 5 追加 ${up.length} 张（当前 ${merged.length} 张），回归状态→部分通过`);
  }

  // ---- issue 1 补证 ----
  const rec1 = records.find((r) => flattenText(r.fields.序号) === '1');
  if (!rec1) {
    console.warn('  ! 找不到序号 1，跳过');
  } else {
    const up = await uploadAll(client, ISSUE1_SCREENSHOTS);
    const existing = rec1.fields.APP截图 ?? [];
    const merged = [...existing.map(({ file_token }) => ({ file_token })), ...up];
    await client.updateRecord(APP_TOKEN, TABLE_ID, rec1.record_id, {
      Issue备注: ISSUE1_EVIDENCE_NOTE,
      APP截图: merged,
    });
    console.log(`  ✓ 序号 1 追加 ${up.length} 张（当前 ${merged.length} 张）`);
  }

  // ---- 新增 issue 14 ----
  const dup = records.find((r) => flattenText(r.fields.序号) === '14');
  if (dup) {
    console.warn('  ! 序号 14 已存在，跳过创建');
  } else {
    const up = await uploadAll(client, ISSUE14_SCREENSHOTS);
    const fields = { ...ISSUE14_FIELDS };
    if (up.length) fields.APP截图 = up;
    await client.batchCreate(APP_TOKEN, TABLE_ID, [fields]);
    console.log(`  ✓ 新增序号 14（附 ${up.length} 张截图）`);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
