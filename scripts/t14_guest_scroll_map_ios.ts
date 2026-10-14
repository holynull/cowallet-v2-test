/**
 * T14 iOS 未登录引导页滚动地图：确认 fresh-install 引导页可滚动内容的
 * top/middle/bottom 覆盖与可达性。
 *
 * 平台：iOS 真机
 * App：IOS_BUNDLE_ID（app.getcowallet.wallet）
 * 前置：fresh-install（欢迎页或介绍页均可，脚本会自适应）；WDA 已就绪
 * 风险等级：🟢 只读。仅滚动与观察，不点按任何按钮，不提交表单。
 *
 * 运行：npm run test:ios:t14
 */

import 'dotenv/config';

import {
  APP_ID,
  createIosAgent,
  createRunContext,
  detectUserState,
  runTest,
} from './lib/cowallet.ts';
import { captureScreen, errorToString, launchApp, sleep } from './lib/device-kit.ts';

type ScrollSnapshot = {
  scanIndex: number;
  positionHint: 'top' | 'middle' | 'bottom' | 'unknown';
  visibleTexts: string[];
  tappableLabels: string[];
  highRiskLabels: string[];
  hasScrollableContent: boolean;
  newVisibleTextCount: number;
};

const MAX_SCROLLS = 5;
const SETTLE_MS = 1200;

async function inspectViewport(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<Omit<ScrollSnapshot, 'scanIndex' | 'newVisibleTextCount'>> {
  return agent.aiQuery<Omit<ScrollSnapshot, 'scanIndex' | 'newVisibleTextCount'>>(
    [
      '观察当前 cowallet iPhone 引导页的当前视口。返回 JSON：',
      'positionHint：根据可见线索判断当前滚动位置，只能是 top/middle/bottom/unknown 之一；',
      'visibleTexts：当前视口内用户可见的文案数组（只包含视口内，不推测屏外内容）；',
      'tappableLabels：当前视口内可见的安全控件/按钮/链接；',
      'highRiskLabels：当前视口内可能触发发送、签名、授权、密钥展示等的控件（如有则重点标注）；',
      'hasScrollableContent：当前页面是否看起来还有可滚动内容。',
      '只观察描述，不要点击、不要滚动。',
    ].join('\n'),
  );
}

async function scrollDownOne(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<boolean> {
  try {
    const size = await agent.page.size();
    await agent.page.scrollDown(Math.round(size.height * 0.5), {
      left: Math.round(size.width / 2),
      top: Math.round(size.height * 0.72),
    });
    await sleep(SETTLE_MS);
    return true;
  } catch (error) {
    console.log(`[t14] scrollDown 失败：${errorToString(error)}`);
    return false;
  }
}

async function scrollBackToTop(
  agent: Awaited<ReturnType<typeof createIosAgent>>['agent'],
): Promise<void> {
  try {
    const size = await agent.page.size();
    for (let index = 0; index < 4; index += 1) {
      await agent.page.scrollUp(Math.round(size.height * 0.6), {
        left: Math.round(size.width / 2),
        top: Math.round(size.height * 0.3),
      });
      await sleep(600);
    }
  } catch {
    // 回到顶部失败不阻塞用例。
  }
}

async function main(): Promise<number> {
  const ctx = await createRunContext('t14-guest-scroll-map-ios');
  const summary: Record<string, unknown> = {
    runName: ctx.runName,
    platform: 'ios',
    bundleId: APP_ID.ios,
    startedAt: new Date().toISOString(),
    status: 'running',
    maxScrolls: MAX_SCROLLS,
  };

  return runTest(ctx, summary, async () => {
    const { agent, deviceId } = await createIosAgent(ctx);
    summary.deviceId = deviceId;

    try {
      summary.deviceInfo = await agent.page.getConnectedDeviceInfo();
      summary.screenSize = await agent.page.getScreenSize();

      await launchApp(agent, APP_ID.ios);
      const startState = await detectUserState(agent);
      summary.startState = startState;
      console.log(`[state] ${startState.state} — ${startState.evidence}`);

      if (startState.state === 'wallet-ready') {
        throw new Error('T14 需要未登录引导态，实际为 wallet-ready。');
      }

      const snapshots: ScrollSnapshot[] = [];
      const seenTexts = new Set<string>();
      const seenFingerprints = new Set<string>();
      let stoppedReason = 'max-scrolls-reached';

      for (let scanIndex = 0; scanIndex <= MAX_SCROLLS; scanIndex += 1) {
        const view = await inspectViewport(agent);
        const visibleTexts = Array.from(new Set(view.visibleTexts || []));
        const newVisibleTextCount = visibleTexts.filter((text) => !seenTexts.has(text)).length;
        const snapshot: ScrollSnapshot = { ...view, visibleTexts, scanIndex, newVisibleTextCount };
        snapshots.push(snapshot);
        visibleTexts.forEach((text) => seenTexts.add(text));

        await captureScreen(
          agent,
          `T14 引导页滚动地图 - scan ${scanIndex}`,
          `T14 引导页滚动地图 scan ${scanIndex}（位置：${view.positionHint}）。`,
          [
            `Position: ${view.positionHint}`,
            `New visible texts: ${newVisibleTextCount}`,
            `Has scrollable: ${view.hasScrollableContent}`,
            `Visible: ${visibleTexts.join(' | ') || 'none'}`,
          ].join('\n'),
        );

        if (scanIndex === MAX_SCROLLS) break;

        const fingerprint = visibleTexts.join('|');
        if (seenFingerprints.has(fingerprint) && newVisibleTextCount === 0) {
          stoppedReason = 'repeated-visible-text-fingerprint';
          break;
        }
        seenFingerprints.add(fingerprint);

        const moved = await scrollDownOne(agent);
        if (!moved) {
          stoppedReason = 'scroll-down-failed-or-not-scrollable';
          break;
        }
      }

      await scrollBackToTop(agent);

      const mergedVisible = Array.from(new Set(snapshots.flatMap((s) => s.visibleTexts)));
      const mergedTappable = Array.from(new Set(snapshots.flatMap((s) => s.tappableLabels || [])));
      const mergedHighRisk = Array.from(new Set(snapshots.flatMap((s) => s.highRiskLabels || [])));
      const sawTop = snapshots.some((s) => s.positionHint === 'top');
      const sawMiddle = snapshots.some((s) => s.positionHint === 'middle');
      const sawBottom = snapshots.some((s) => s.positionHint === 'bottom');

      summary.snapshots = snapshots;
      summary.merged = {
        uniqueVisibleTexts: mergedVisible,
        uniqueTappableLabels: mergedTappable,
        uniqueHighRiskLabels: mergedHighRisk,
        sawTop,
        sawMiddle,
        sawBottom,
        stoppedReason,
        scanCount: snapshots.length,
      };

      // 断言：滚动过程中绝不出现高风险的执行边界控件。
      // 注意只匹配 AI 单独标注的 highRiskLabels（会触发动作的控件），
      // 不要对整个视口文案做关键词扫描——引导页的教育性文案会正常出现
      // "签名/助记词/钥匙"等词（门限签名介绍），那不属于执行边界。
      const boundaryHits = mergedHighRisk;
      summary.boundaryScan = {
        found: boundaryHits,
        pass: boundaryHits.length === 0,
      };
      if (boundaryHits.length > 0) {
        throw new Error(`滚动地图视口中出现疑似执行边界文案：${boundaryHits.join('、')}`);
      }

      await captureScreen(
        agent,
        'T14 结束状态',
        'T14 滚动地图结束后回到的页面。',
        [
          `Scans: ${snapshots.length}`,
          `Unique visible texts: ${mergedVisible.length}`,
          `Stopped reason: ${stoppedReason}`,
          `High-risk labels found: ${mergedHighRisk.length}`,
        ].join('\n'),
      );
      const endState = await detectUserState(agent);
      summary.endState = endState;
      console.log(`[state] end ${endState.state} — ${endState.evidence}`);

      summary.status = 'passed';
      summary.midsceneReport = agent.reportFile ?? null;
    } finally {
      await agent.destroy().catch((error: unknown) => {
        console.error(`[warn] agent.destroy 失败：${errorToString(error)}`);
      });
    }
  });
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(errorToString(error));
    process.exit(1);
  });
