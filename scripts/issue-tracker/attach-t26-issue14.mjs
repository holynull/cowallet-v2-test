#!/usr/bin/env node
/**
 * T26/T26b（转账确认卡地址展示，issue 14 复测）证据归档。
 *
 * 结论细化：确认卡**有**「你粘贴或输入的地址」行，但该行位于卡片顶部，被 App 固定
 * 顶部横幅（“助手可能出错，转账前请核对卡片。服务条款”）重叠遮挡——T19 时整行不可见、
 * T26b 时遮住 “0x” 前缀。已知地址（以前转过）则完整显示 + 复制按钮 + “以前转过”，
 * 无需尾 4 核对。未知地址强制「请输入最后 4 个字符才能批准」。
 * 根因是布局重叠，而非“卡上永不渲染地址”。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t26-issue14.mjs              # dry-run
 *   node scripts/issue-tracker/attach-t26-issue14.mjs --apply
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, flattenText, getUserToken } from './lib/lark.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

const APP_TOKEN = 'QVGLbx4zIauLNxsxPZYjHvSbpUh';
const TABLE_ID = 'tblQSxhJi3fb4ml7';

const SHOTS = [
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue14-t26', 't26-known-addr-card-full-addr.jpeg'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue14-t26', 't26b-unknown-addr-card-last4.png'),
];

const NOTE =
  '【2026-10-14 T26/T26b 复测（0.0001 ETH 转账草稿，到确认卡即停，未执行）】' +
  '1) 已知地址（0x75276A6E…D767B，T19 转过）：确认卡**完整显示收款地址** 0x75276a6e…d767b +「复制」按钮 +「√ 以前转过」，无尾 4 核对；' +
  '2) 未知地址（0x12345678…5678，首次转）：确认卡顶部有「你粘贴或输入的地址」行（渲染了地址值），但该行被 App 固定顶部横幅' +
  '（“助手可能出错，转账前请核对卡片。服务条款”）**重叠遮挡**——T19 时整行不可见（卡正文直接从 网络手续费 开始），T26b 时遮住地址 “0x” 前缀；' +
  '3) 未知地址强制「请输入上面地址的最后 4 个字符才能批准」。' +
  '结论：issue 14 成立，根因更精确为**布局重叠 bug**（确认卡顶部地址行被固定横幅遮挡，导致卡上无法可靠核对收款地址），' +
  '而非“卡上永不渲染地址”；已知地址体验正常。建议：修复卡片顶部与横幅的重叠，未知地址时也应在卡片上清晰完整展示收款地址（可加复制/展开）。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 14（reczz28N9B7Fd6c9）← 追加 ${SHOTS.length} 张复测截图 + 回归备注`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }
  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '14');
  if (!rec) {
    console.warn('  ! 找不到序号 14');
    return;
  }
  const uploaded = [];
  for (const file of SHOTS) {
    try {
      uploaded.push({ file_token: await client.uploadMedia(APP_TOKEN, file) });
    } catch (error) {
      console.warn(`  ! ${path.basename(file)} 上传失败：${error instanceof Error ? error.message : error}`);
    }
  }
  const existing = rec.fields.APP截图 ?? [];
  const merged = [...existing.map(({ file_token }) => ({ file_token })), ...uploaded];
  await client.updateRecord(APP_TOKEN, TABLE_ID, rec.record_id, {
    回归备注: NOTE,
    APP截图: merged,
  });
  console.log(`  ✓ issue 14 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归备注已更新`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
