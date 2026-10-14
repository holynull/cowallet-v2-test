#!/usr/bin/env node
/**
 * T29（issue 16：收款到账无 PUSH/锁屏推送）证据归档。
 *
 * 结论：真实外部转入 +0.0005 ETH（链上 0.0034777 → 0.0039777 ETH，Ethereum 主网确认），
 * App 后台化 + 设备锁屏/通知中心场景下 **没有任何「收到/到账」类资金 PUSH**：
 *   1) 锁屏/通知中心只有 TestFlight 自动更新通知（“CoWallet AI”已是最新版本 ·
 *      版本 1.0.2 (2610132055) 已自动下载并安装 · Jiayan Liu via TestFlight 4个通知），
 *      无收款到账推送；
 *   2) 对照：站内首页铃铛出现红点角标，通知中心有「收到钱了 — 收到 0.0005 ETH（Ethereum）
 *      · 收款 · Ethereum · 0xeaad…5137 · 1分钟前」；
 *   3) 重新打开 App 停留在收款页（后台前所在页），无推送引导跳转。
 * 源码佐证：mobile/lib/services/push_service.dart 的 PushType 枚举仅
 * tx_confirmed/tx_failed/security_alert/mpc_sign_request，无「收款到账」类型；
 * backend api-server/src/routes/push.rs 仅在 mpc_sign_request 时发送 push。
 * → issue 16 成立：到账仅有站内通知，无锁屏/PUSH 推送。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-t29-issue16.mjs        # dry-run
 *   node scripts/issue-tracker/attach-t29-issue16.mjs --apply
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
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue16', 'lockscreen-no-receive-push.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue16', 'home-bell-badge.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue16', 'inapp-notification-center.png'),
  path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue16', 'app-reopened-receive-page.png'),
];

const REGRESSION_NOTE =
  '【2026-10-14 T29 锁屏/后台 PUSH 复测（真实外部转入 +0.0005 ETH，Ethereum 主网）】' +
  '外部地址 0xeaad…5137 向钱包 0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821 转入 0.0005 ETH，' +
  '链上余额 0.0034777 → 0.0039777 ETH（多 RPC 确认）。' +
  'App 后台化（按 Home）+ 设备保持解锁后下拉通知中心：**无任何「收到/到账」类资金 PUSH**，' +
  '锁屏/通知中心仅见 TestFlight 自动更新通知（“CoWallet AI”已是最新版本 · 版本 1.0.2 (2610132055) 已自动下载并安装 · ' +
  'Jiayan Liu via TestFlight 4个通知）。' +
  '对照（站内通知存在）：重新打开 App 停在后台前所在页（收款页）；首页右上角铃铛出现红色未读角标，' +
  '站内通知中心显示「收到钱了 — 收到 0.0005 ETH（Ethereum）· 收款 · Ethereum · 0xeaad…5137 · 1分钟前」。' +
  '源码佐证：mobile/lib/services/push_service.dart 的 PushType 枚举仅 ' +
  'tx_confirmed/tx_failed/security_alert/mpc_sign_request，无「收款到账」类型；' +
  'backend api-server/src/routes/push.rs 仅在 mpc_sign_request 时发送 push。' +
  '→ 结论：到账仅站内铃铛通知，**无锁屏/PUSH 推送**，issue 16 成立。' +
  '注：测试期间 TestFlight 自动更新了 App build（2610121802 → 2610132055），锁屏通知中的「已是最新版本」为系统更新提示，非收款推送。';

async function main() {
  console.log(`目标：app_token=${APP_TOKEN} table_id=${TABLE_ID}`);
  console.log(`  issue 16（reczz28NBqmNOyWh）← 追加 ${SHOTS.length} 张证据截图 + 回归备注`);
  if (!APPLY) {
    console.log('\n加 --apply 才会上传并写入。');
    return;
  }

  const client = createClient(await getUserToken());
  const records = await client.listAllRecords(APP_TOKEN, TABLE_ID);
  const rec = records.find((r) => flattenText(r.fields.序号) === '16');
  if (!rec) {
    console.warn('  ! 找不到序号 16，跳过');
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
    回归备注: REGRESSION_NOTE,
    回归验证状态: '已验收',
    APP截图: merged,
  });
  console.log(`  ✓ issue 16 追加 ${uploaded.length} 张（当前 ${merged.length} 张），回归备注/回归验证状态已更新`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
