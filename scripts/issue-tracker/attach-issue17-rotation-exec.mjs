#!/usr/bin/env node
/**
 * Issue 17（真实执行密钥轮换失败）记录 + 证据归档。
 *
 * 结论：用户授权「真实验证一次换钥匙」并经「再试一次」完成第二次真实尝试，
 * 两次均在密码校验 + Face ID 确认后失败，服务端错误码 rotation_backup_proof_required；
 * 失败屏仅「再试一次 / 关闭」，无原因说明、无替代路径；旧钥匙仍有效（未损坏）。
 * 与 issue 3（入口存在）独立，属执行阶段失败 + UX 死胡同。
 *
 * 用法：
 *   node scripts/issue-tracker/attach-issue17-rotation-exec.mjs        # dry-run
 *   node scripts/issue-tracker/attach-issue17-rotation-exec.mjs --apply
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
const SEQ = '17';

const SHOT_DIR = path.join(ROOT_DIR, 'findings', 'assets', 'feishu-issue17-rotation-exec');
const SHOTS = fs
  .readdirSync(SHOT_DIR)
  .filter((f) => f.endsWith('.png'))
  .map((f) => path.join(SHOT_DIR, f));

const ISSUE = '真实执行密钥轮换失败（rotation_backup_proof_required），失败屏无原因说明与替代路径，旧钥匙仍有效';

const ISSUE_NOTE =
  '【2026-10-14 真实执行（用户授权「真实验证一次换钥匙」，并经「再试一次」重试）】' +
  '设置 → 密钥安全 → 「轮换密钥分片」→「换一套新钥匙」→「开始换钥匙」→ 输入恢复密码 →「核对」→ Face ID 确认 → 等待「正在准备素数…」→ ' +
  '失败屏「钥匙没有换成（rotation_backup_proof_required）。旧钥匙和旧的 24 个助记词仍然有效，请稍后再试。」，按钮仅「再试一次 / 关闭」。' +
  '两次真实尝试同结果（第 1 次 Face ID 已由用户手动通过；第 2 次由脚本驱动重试）。' +
  '失败屏无原因说明、无「去完成备份验证」等替代路径，反复「再试一次」循环回到同一失败点。' +
  '资产安全：旧钥匙仍有效，钱包地址与余额未变（0x7C0C85034Eb214EC6D5C8E5253BDC44f6A024821，≈0.0039777 ETH）。' +
  '根因推测：服务端 has_backup_proof（shard_metadata.backup_shard_hash）门槛未满足，需产品/后端确认正常完成备份验证后是否应具备。' +
  '与 issue 3（轮换入口存在）独立；与 issue 15 同属「失败即死胡同」UX 缺口。';

const IMPACT =
  '持有合法恢复密码且通过 Face ID 确认的用户无法完成密钥轮换；失败屏无原因与替代路径，反复「再试一次」无出口。' +
  '未造成资产损坏（旧钥匙仍有效）。功能可用性：高影响（核心安全功能不可用）。';

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
        严重程度: '高',
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
