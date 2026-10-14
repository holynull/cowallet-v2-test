#!/usr/bin/env node
/**
 * CoWallet v2 真机测试环境自检（只读 preflight）。
 *
 * 用法：
 *   node scripts/doctor.mjs                       # 同时检查 Android 与 iOS
 *   node scripts/doctor.mjs --platform android
 *   node scripts/doctor.mjs --platform ios
 *   node scripts/doctor.mjs --probe               # 允许启动 adb server（会真正执行 adb devices）
 *   node scripts/doctor.mjs --json                # 机器可读输出
 *
 * 行为约定：
 * - 只读取状态：不安装/卸载 App、不清应用数据、不改设备设置、不自动启动 WDA。
 * - 默认不主动拉起 adb server（拉起 daemon 属于有副作用的动作）；只有 --probe 或
 *   已经检测到 adb server 在运行时才会查询设备列表。
 * - 只报告环境变量“是否已设置”，绝不打印 API Key / 助记词 / 密码等敏感值。
 *
 * 退出码：0 = 没有 fail；1 = 存在 fail 项。
 */

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getOption = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(
    [
      'CoWallet v2 真机测试环境自检',
      '',
      '  node scripts/doctor.mjs [--platform android|ios|all] [--probe] [--json]',
      '',
      '  --platform  指定检查哪一端，默认 all',
      '  --probe     允许启动 adb server 并查询设备列表（默认只复用已在运行的 server）',
      '  --json      输出 JSON，便于脚本或 CI 消费',
    ].join('\n'),
  );
  process.exit(0);
}

const platform = getOption('--platform', 'all');
if (!['all', 'android', 'ios'].includes(platform)) {
  console.error(`--platform 只能是 android、ios 或 all，收到：${platform}`);
  process.exit(2);
}
const allowProbe = hasFlag('--probe');
const asJson = hasFlag('--json');

const SENSITIVE_NAME = /(KEY|TOKEN|SECRET|PASSWORD|MNEMONIC|PRIVATE|SEED|OTP|JWT)/i;
const checks = [];

function record(level, area, message, hint) {
  checks.push({ level, area, message, hint });
}

async function cmd(file, args = [], timeout = 15000) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? null,
      stdout: typeof error?.stdout === 'string' ? error.stdout : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : '',
      message: error?.message ?? String(error),
    };
  }
}

async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function which(binary) {
  const result = await cmd('/usr/bin/which', [binary]);
  const found = result.ok ? result.stdout.trim() : '';
  return found || null;
}

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function describeEnvValue(name, value) {
  if (value === undefined || value === '') return '未设置';
  if (SENSITIVE_NAME.test(name)) return `已设置（${value.length} 字符，值不显示）`;
  return value;
}

const envFileValues = {};
let envFileFound = false;

async function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  envFileFound = await pathExists(envPath);
  if (!envFileFound) return;
  Object.assign(envFileValues, parseEnvFile(await readFile(envPath, 'utf8')));
}

function env(name) {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
  return envFileValues[name];
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) {
    record('ok', 'runtime', `Node ${process.version}`);
  } else {
    record(
      'fail',
      'runtime',
      `Node ${process.version} 过旧`,
      '需要 Node 20 以上（tsx 与 midscene 依赖较新的运行时）。',
    );
  }
}

async function checkDependencies() {
  const required = [
    ['@midscene/android', 'node_modules/@midscene/android'],
    ['@midscene/ios', 'node_modules/@midscene/ios'],
    ['tsx', 'node_modules/tsx'],
    ['dotenv', 'node_modules/dotenv'],
  ];
  const missing = [];
  for (const [name, relative] of required) {
    if (!(await pathExists(path.join(ROOT_DIR, relative)))) missing.push(name);
  }
  if (missing.length === 0) {
    record('ok', '依赖', '本仓库 node_modules 已安装 midscene / tsx / dotenv');
    return;
  }
  record(
    'fail',
    '依赖',
    `缺少：${missing.join(', ')}`,
    '在本仓库执行 npm install 后重跑 doctor（依赖安装前请先确认）。',
  );
}

function checkModelConfig() {
  const required = [
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_FAMILY',
    'MIDSCENE_MODEL_API_KEY',
  ];
  const missing = required.filter((name) => !env(name));
  if (missing.length === 0) {
    record(
      'ok',
      '模型',
      `Midscene 模型配置完整：${describeEnvValue('MIDSCENE_MODEL_NAME', env('MIDSCENE_MODEL_NAME'))}`,
    );
  } else {
    record(
      'fail',
      '模型',
      `缺少模型环境变量：${missing.join(', ')}`,
      '参考 .env.example 里的 Midscene 段落补齐后重跑。',
    );
  }
  if (env('MIDSCENE_REPLANNING_CYCLE_LIMIT')) {
    record('info', '模型', `重规划上限 ${env('MIDSCENE_REPLANNING_CYCLE_LIMIT')}`);
  }
}

async function isAdbServerRunning() {
  const result = await cmd('/usr/bin/pgrep', [
    '-f',
    '(^|/)adb([[:space:]].*(fork-server|server-nodaemon))',
  ]);
  return result.ok && result.stdout.trim() !== '';
}

function parseAdbDevices(stdout) {
  const devices = [];
  for (const line of stdout.split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*')) continue;
    const [serial, state, ...rest] = trimmed.split(/\s+/);
    if (!serial) continue;
    const detail = {};
    for (const token of rest) {
      const separator = token.indexOf(':');
      if (separator > 0) detail[token.slice(0, separator)] = token.slice(separator + 1);
    }
    devices.push({ serial, state, detail });
  }
  return devices;
}

async function checkAndroid() {
  const adbBinary = env('ADB_BIN') || 'adb';
  const adbPath = await which(adbBinary);
  if (!adbPath) {
    record(
      'fail',
      'Android',
      `找不到 adb（${adbBinary}）`,
      '安装 Android platform-tools，或在 .env 里把 ADB_BIN 指向 adb 的绝对路径。',
    );
    return;
  }

  const versionResult = await cmd(adbPath, ['version']);
  const versionLine =
    versionResult.stdout.split(/\r?\n/).find((line) => line.startsWith('Android Debug Bridge')) ||
    'Android Debug Bridge（版本未知）';
  record('ok', 'Android', `${versionLine}（${adbPath}）`);

  const bundleId = env('ANDROID_BUNDLE_ID') || 'com.cowallet.app';
  record('info', 'Android', `目标包名 ${bundleId}`);

  const serverRunning = await isAdbServerRunning();
  if (!serverRunning && !allowProbe) {
    record(
      'warn',
      'Android',
      'adb server 未运行，已跳过设备查询',
      `插上设备并开启 USB 调试后，运行 npm run doctor:android -- --probe（会启动 adb server），或直接 adb devices。`,
    );
    return;
  }

  if (!serverRunning && allowProbe) {
    const started = await cmd(adbPath, ['start-server'], 30000);
    record(
      started.ok ? 'info' : 'fail',
      'Android',
      started.ok ? '已按 --probe 启动 adb server' : 'adb start-server 失败',
      started.ok ? undefined : started.stderr.trim() || started.message,
    );
  } else {
    record('info', 'Android', '检测到已有 adb server 在运行');
  }

  const devicesResult = await cmd(adbPath, ['devices', '-l'], 30000);
  if (!devicesResult.ok) {
    record('fail', 'Android', 'adb devices 执行失败', devicesResult.stderr.trim() || devicesResult.message);
    return;
  }

  const devices = parseAdbDevices(devicesResult.stdout);
  const usable = devices.filter((device) => device.state === 'device');
  const problematic = devices.filter((device) => device.state !== 'device');

  for (const device of problematic) {
    const hint =
      device.state === 'unauthorized'
        ? '在手机屏幕上确认「允许 USB 调试」授权弹窗。'
        : device.state === 'offline'
          ? '重新插拔数据线或 adb kill-server 后重试。'
          : '检查设备连接状态。';
    record('fail', 'Android', `设备 ${device.serial} 状态为 ${device.state}`, hint);
  }

  if (usable.length === 0) {
    record(
      'warn',
      'Android',
      '没有处于 device 状态的安卓真机',
      '连接手机 → 打开开发者选项与 USB 调试 → 授权本机指纹 → 重跑 doctor。',
    );
    return;
  }

  record('ok', 'Android', `可用设备 ${usable.length} 台：${usable.map((d) => d.serial).join(', ')}`);

  const pinned = env('ANDROID_DEVICE_ID');
  if (pinned && !usable.some((device) => device.serial === pinned)) {
    record('fail', 'Android', `ANDROID_DEVICE_ID=${pinned} 不在已连接设备中`, '修正 .env 里的 serial。');
  } else if (!pinned && usable.length > 1) {
    record(
      'warn',
      'Android',
      '连接了多台设备但没有固定 ANDROID_DEVICE_ID',
      '脚本会拒绝在目标不唯一时执行，请在 .env 里固定 serial。',
    );
  }

  for (const device of usable) {
    const [model, release] = await Promise.all([
      cmd(adbPath, ['-s', device.serial, 'shell', 'getprop', 'ro.product.model']),
      cmd(adbPath, ['-s', device.serial, 'shell', 'getprop', 'ro.build.version.release']),
    ]);
    record(
      'info',
      'Android',
      `${device.serial}：${model.ok ? model.stdout.trim() : '型号未知'} / Android ${
        release.ok ? release.stdout.trim() : '版本未知'
      }`,
    );

    const power = await cmd(adbPath, ['-s', device.serial, 'shell', 'dumpsys', 'power']);
    const wakefulness = power.stdout.match(/mWakefulness=(\w+)/)?.[1];
    if (wakefulness && wakefulness !== 'Awake') {
      record('warn', 'Android', `${device.serial} 屏幕状态 ${wakefulness}`, '把设备解锁并保持亮屏后再跑测试。');
    }

    const packagePath = await cmd(adbPath, ['-s', device.serial, 'shell', 'pm', 'path', bundleId]);
    if (packagePath.stdout.includes('package:')) {
      const dump = await cmd(adbPath, ['-s', device.serial, 'shell', 'dumpsys', 'package', bundleId], 30000);
      const versionName = dump.stdout.match(/versionName=(\S+)/)?.[1] ?? '未知';
      const versionCode = dump.stdout.match(/versionCode=(\d+)/)?.[1] ?? '未知';
      record('ok', 'Android', `${bundleId} 已安装：versionName=${versionName} versionCode=${versionCode}`);
    } else {
      record(
        'warn',
        'Android',
        `${bundleId} 未安装在该设备上`,
        '需要先安装被测 APK（安装动作属于设备变更，请先确认包来源与授权）。',
      );
    }
  }
}

async function isWdaReady() {
  const url = env('WDA_STATUS_URL') || 'http://127.0.0.1:8100/status';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { ready: false, url, reason: `HTTP ${response.status}` };
    const body = await response.json();
    const ready = Boolean(
      body?.value?.ready === true || body?.ready === true || body?.value?.state === 'success',
    );
    return { ready, url };
  } catch (error) {
    return { ready: false, url, reason: error?.message ?? String(error) };
  }
}

function parseDevicectlDevices(stdout) {
  const devices = [];
  let headerSeen = false;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!headerSeen) {
      if (/^Name\s+Hostname/.test(line)) headerSeen = true;
      continue;
    }
    const columns = line.split(/\s{2,}/).map((value) => value.trim());
    if (columns.length < 4) continue;
    devices.push({
      name: columns[0],
      hostname: columns[1],
      identifier: columns[2],
      state: columns[3],
      model: columns[4] ?? '',
    });
  }
  return devices;
}

async function checkIos() {
  const bundleId = env('IOS_BUNDLE_ID') || 'com.cowallet.app';
  record('info', 'iOS', `目标 bundle id ${bundleId}`);

  const xcodebuild = await cmd('xcodebuild', ['-version'], 30000);
  if (xcodebuild.ok) {
    const [xcodeLine, sdkLine] = xcodebuild.stdout.split(/\r?\n/);
    record('ok', 'iOS', `${(xcodeLine || 'Xcode').trim()} / ${(sdkLine || '').trim()}`.trim());
  } else {
    record('fail', 'iOS', 'xcodebuild 不可用', '安装完整版 Xcode 并执行 sudo xcode-select -s /Applications/Xcode.app。');
  }

  const iproxyPath = await which('iproxy');
  record(
    iproxyPath ? 'ok' : 'fail',
    'iOS',
    iproxyPath ? `iproxy 可用（${iproxyPath}）` : '找不到 iproxy',
    iproxyPath ? undefined : '安装 USB 端口转发工具：brew install libusbmuxd。',
  );

  // UDID 校验以 idevice_id 为准：devicectl 对未连接设备只给 UUID，不能用来校验 UDID。
  const pinned = env('IOS_UDID');
  const attached = await cmd('idevice_id', ['-l'], 15000);
  const attachedUdids = attached.ok
    ? attached.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    : null;

  if (!attached.ok) {
    record('warn', 'iOS', 'idevice_id 不可用，无法确认 USB 连接的 iOS 真机', 'brew install libimobiledevice。');
  }

  if (!pinned) {
    record(
      'fail',
      'iOS',
      'IOS_UDID 未设置',
      '把目标 iPhone 的 UDID 填进 .env 的 IOS_UDID（脚本只认显式固定的设备）。',
    );
  } else if (attachedUdids === null) {
    record('info', 'iOS', `IOS_UDID=${pinned}（idevice_id 不可用，未能校验）`);
  } else if (attachedUdids.length === 0) {
    record(
      'warn',
      'iOS',
      '没有检测到 USB 连接的 iOS 真机，无法校验 IOS_UDID',
      '用数据线连接 iPhone → 手机上点「信任此电脑」→ 开启开发者模式后重新检查。',
    );
  } else if (attachedUdids.includes(pinned)) {
    record('ok', 'iOS', `目标设备已通过 USB 连接：${pinned}`);
  } else {
    record(
      'fail',
      'iOS',
      `IOS_UDID=${pinned} 不在 USB 已连接设备中`,
      `当前已连接：${attachedUdids.join(', ')}`,
    );
  }

  const devicectl = await cmd('xcrun', ['devicectl', 'list', 'devices'], 60000);
  if (devicectl.ok) {
    const devices = parseDevicectlDevices(devicectl.stdout);
    const available = devices.filter((device) => device.state.startsWith('available'));
    record('info', 'iOS', `devicectl 已知设备 ${devices.length} 台，其中已连接 ${available.length} 台`);
    if (available.length > 0) {
      record(
        'info',
        'iOS',
        `devicectl 已连接：${available.map((device) => `${device.name}（${device.model}）`).join('、')}`,
      );
    }
  } else {
    record('warn', 'iOS', 'xcrun devicectl list devices 执行失败', devicectl.stderr.trim() || devicectl.message);
  }

  const teamId = env('WDA_DEVELOPMENT_TEAM');
  if (teamId) {
    record('ok', 'iOS', `WDA_DEVELOPMENT_TEAM 已设置（${teamId.length} 字符）`);
  } else {
    record('fail', 'iOS', 'WDA_DEVELOPMENT_TEAM 未设置', '填 Apple Developer Team ID，用于给 WebDriverAgentRunner 签名。');
  }

  const wdaProjectValue = env('WDA_PROJECT_PATH') || 'node_modules/appium-webdriveragent/WebDriverAgent.xcodeproj';
  const wdaProject = path.isAbsolute(wdaProjectValue) ? wdaProjectValue : path.join(ROOT_DIR, wdaProjectValue);
  record(
    (await pathExists(wdaProject)) ? 'ok' : 'fail',
    'iOS',
    (await pathExists(wdaProject)) ? `WDA 工程存在：${path.relative(ROOT_DIR, wdaProject)}` : `WDA 工程不存在：${wdaProject}`,
    (await pathExists(wdaProject)) ? undefined : '执行 npm install 安装 appium-webdriveragent，或把 WDA_PROJECT_PATH 指向已有工程。',
  );

  const identities = await cmd('security', ['find-identity', '-v', '-p', 'codesigning'], 20000);
  const developmentIdentities = identities.stdout
    .split(/\r?\n/)
    .filter((line) => line.includes('"Apple Development:') || line.includes('"iPhone Developer:'));
  record(
    developmentIdentities.length > 0 ? 'ok' : 'warn',
    'iOS',
    developmentIdentities.length > 0
      ? `钥匙串里有 ${developmentIdentities.length} 个可用代码签名身份`
      : '钥匙串里没有 Apple Development 代码签名身份',
    developmentIdentities.length > 0 ? undefined : '在 Xcode 里登录开发者账号并创建开发证书。',
  );

  const wda = await isWdaReady();
  if (wda.ready) {
    record('ok', 'iOS', `WDA 已就绪：${wda.url}`);
  } else {
    record(
      'info',
      'iOS',
      `WDA 未就绪（${wda.url}）`,
      '需要 iOS 测试时先运行 npm run wda:check 查看条件，再 npm run wda:start（会编译并签名 WDA）。',
    );
  }

  const appiumPath = await which('appium');
  if (appiumPath) {
    const appiumVersion = await cmd(appiumPath, ['--version'], 30000);
    record('ok', 'iOS', `Appium ${appiumVersion.ok ? appiumVersion.stdout.trim() : '（版本未知）'}`);
  } else {
    record('warn', 'iOS', '找不到 appium', '仅部分 iOS 场景需要 Appium：npm i -g appium。');
  }
}

function printReport() {
  const marker = { ok: '[ ok ]', warn: '[warn]', fail: '[fail]', info: '[info]' };
  const counts = checks.reduce((accumulator, check) => {
    accumulator[check.level] = (accumulator[check.level] ?? 0) + 1;
    return accumulator;
  }, {});

  console.log(`CoWallet v2 真机测试自检（platform=${platform}）`);
  console.log('='.repeat(64));
  for (const check of checks) {
    console.log(`${marker[check.level]} ${check.area}: ${check.message}`);
    if (check.hint) console.log(`       ↳ ${check.hint}`);
  }
  console.log('='.repeat(64));
  console.log(
    `汇总：ok ${counts.ok ?? 0} / warn ${counts.warn ?? 0} / fail ${counts.fail ?? 0} / info ${
      counts.info ?? 0
    }`,
  );

  if (!envFileFound) {
    console.log('\n提示：还没有 .env。先执行 cp .env.example .env 并填写设备与模型配置。');
  }
  if ((counts.fail ?? 0) > 0) {
    console.log('\n先解决 fail 项，再开始真机测试。');
  } else if ((counts.warn ?? 0) > 0) {
    console.log('\n没有 fail 项；warn 项通常意味着设备还没插上，插上后重跑一次即可。');
  } else {
    console.log('\n环境自检通过，可以开始跑 smoke 用例。');
  }
}

async function main() {
  checkNode();
  await loadEnvFile();
  record(
    envFileFound ? 'ok' : 'warn',
    '配置',
    envFileFound ? '.env 已存在' : '.env 不存在',
    envFileFound ? undefined : 'cp .env.example .env 后填写 IOS_UDID / WDA_DEVELOPMENT_TEAM / MIDSCENE_MODEL_API_KEY。',
  );
  await checkDependencies();
  checkModelConfig();
  if (platform === 'all' || platform === 'android') await checkAndroid();
  if (platform === 'all' || platform === 'ios') await checkIos();

  if (asJson) {
    const payload = {
      platform,
      probed: allowProbe,
      envFileFound,
      node: process.version,
      checks,
      summary: checks.reduce((accumulator, check) => {
        accumulator[check.level] = (accumulator[check.level] ?? 0) + 1;
        return accumulator;
      }, {}),
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printReport();
  }

  process.exit(checks.some((check) => check.level === 'fail') ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
