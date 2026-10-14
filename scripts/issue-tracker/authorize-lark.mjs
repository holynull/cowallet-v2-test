#!/usr/bin/env node
/**
 * 飞书 MCP 的 OAuth 重新授权（拿一个带 bitable 权限的 user token）。
 *
 * 为什么需要它：
 *   lark-mcp 当前登录会话只有 docx / drive / wiki 只读权限，读写多维表格（Base）会报
 *   99991679 / 99991672 权限错误。重新授权一次即可补齐 bitable:app 权限。
 *
 * 为什么必须占用 3000 端口：
 *   飞书应用 cli_a9313a6d3a385e18 只登记了回调地址 http://localhost:3000/callback，
 *   其它端口会被 Lark 以 20029「redirect_uri 请求不合法」拒绝（3912/4000 实测如此）。
 *   所以运行前要确保 3000 空闲，例如临时停掉占用它的容器：
 *     docker stop wallet-agent-demo-next-1     # 之后再 docker start 恢复
 *
 * 用法：
 *   node scripts/issue-tracker/authorize-lark.mjs            # 等待 30 分钟，浏览器自动打开授权页
 *   LARK_LOGIN_PORT=3000 node scripts/issue-tracker/authorize-lark.mjs
 *
 * 说明：
 *   - 会自动备份 ~/Library/Application Support/lark-mcp-nodejs/storage.json（授权流程会先清掉旧 token）；
 *   - 不会打印 app secret 或 access token；
 *   - 授权成功后浏览器显示 "success, you can close this page now"。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const CODEX_CONFIG = path.join(os.homedir(), '.codex', 'config.toml');
const STORE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'lark-mcp-nodejs');
const STORE_PATH = path.join(STORE_DIR, 'storage.json');
const PACKAGE_CANDIDATES = [
  process.env.LARK_MCP_PACKAGE_ROOT,
  '/Users/zhangleping/.npm/_npx/74dfe5d932228314/node_modules/@larksuiteoapi/lark-mcp',
].filter(Boolean);

function readAppCredentials() {
  const config = fs.readFileSync(CODEX_CONFIG, 'utf8');
  const match = /\[mcp_servers\.feishu\][\s\S]*?args\s*=\s*\[([\s\S]*?)\]/.exec(config);
  if (!match) {
    throw new Error(`在 ${CODEX_CONFIG} 里找不到 mcp_servers.feishu 配置`);
  }
  const args = match[1].split(',').map((value) => value.trim().replace(/^["']|["']$/g, ''));
  const appId = args[args.indexOf('-a') + 1];
  const appSecret = args[args.indexOf('-s') + 1];
  if (!appId || !appSecret) throw new Error('mcp_servers.feishu 的 args 里取不到 -a/-s');
  return { appId, appSecret };
}

function resolvePackageRoot() {
  const found = PACKAGE_CANDIDATES.find((candidate) =>
    fs.existsSync(path.join(candidate, 'dist/cli/login-handler.js')),
  );
  if (!found) {
    throw new Error('找不到 @larksuiteoapi/lark-mcp，请设置 LARK_MCP_PACKAGE_ROOT 指向包目录');
  }
  return found;
}

function backupStore() {
  if (!fs.existsSync(STORE_PATH)) return null;
  const backupPath = path.join(STORE_DIR, `storage.json.backup-${Date.now()}`);
  fs.copyFileSync(STORE_PATH, backupPath);
  return backupPath;
}

const port = process.env.LARK_LOGIN_PORT ?? '3000';
const { appId, appSecret } = readAppCredentials();
const packageRoot = resolvePackageRoot();

const backupPath = backupStore();
console.log(backupPath ? `[backup] 已备份现有登录会话：${backupPath}` : '[backup] 没有旧会话需要备份');
console.log(`[port] 使用 ${port}（飞书应用只接受 http://localhost:${port}/callback）`);

const { LoginHandler } = createRequire(import.meta.url)(
  path.join(packageRoot, 'dist/cli/login-handler.js'),
);

await LoginHandler.handleLogin({
  appId,
  appSecret,
  domain: 'https://open.larksuite.com',
  host: 'localhost',
  port,
  scope: [
    'auth:user.id:read',
    'docx:document:readonly',
    'drive:drive:readonly',
    'wiki:wiki:readonly',
    'bitable:app',
  ],
  timeout: Number(process.env.LARK_LOGIN_TIMEOUT_MS ?? 1800000),
});
