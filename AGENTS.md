<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

---

# AGENTS.md — cowallet-v2-test

Guidance for coding/testing agents working in this repository.

## What this repository is

This is the **real-device black-box testing workspace for CoWallet v2**, a mobile AI-native MPC crypto wallet app.

It is not the application source repository. The app lives in the sibling repo `../cowallet` (`mobile/` for the Flutter app, `backend/` for the API). Do not modify production app code from here unless the user explicitly asks for a product fix.

Stack: **Midscene** (visual / natural-language driven device control) + `adb` for Android, **Appium + WebDriverAgent** for iOS. The vision model is Doubao (Volcano Ark), configured through the git-ignored `.env`.

Repository status: scaffolded by an agent on 2026-10-12; `main` still has no commits. Remote `origin` is `git@holynull.github.com:holynull/cowallet-v2-test.git`.

## Start here（跨会话基线 / 必须读）

测试会跨多个会话持续进行。**任何新会话开始工作前，先读这两份文件**：

- `docs/TEST-CAMPAIGN-BASELINE.md` —— 测试战役基线：环境/设备/钱包状态、Issue 汇总、脚本清单、待办、关键陷阱、恢复步骤。
- `docs/issue-tracker/issue-status.md` —— 飞书 Issue 表的本地只读快照（唯一事实源是飞书 Base `QVGLbx4zIauLNxsxPZYjHvSbpUh` / `tblQSxhJi3fb4ml7`）。

会话结束时的收尾约定：

1. 新发现/回归结论 → `findings/FINDING-*.md`（中文，UI 原文保留原语言）。
2. 挂飞书 → `node scripts/issue-tracker/attach-*.mjs --apply`（证据截图 + 回归备注）。
3. 刷新本地快照 → `node scripts/issue-tracker/snapshot-issues.mjs`。
4. 更新 `docs/TEST-CAMPAIGN-BASELINE.md` 的进度/待办部分，让下一个会话能接续。

测试报告：`docs/TEST-REPORT-2026-10-14.md` 是**唯一事实源**；改报告就改这份 md，再跑
`node scripts/issue-tracker/regenerate-report-doc.mjs` 重新导入飞书文档（返回新 document_id/URL；
旧文档用 `DELETE /open-apis/drive/v1/files/:token?type=docx` 手动删除）。
不要对飞书报告做块级编辑（表格行删除 404、单元格需内部 text block，不可靠）。

## Layout

| Path | Purpose |
| --- | --- |
| `scripts/doctor.mjs` | Read-only environment preflight: devices, deps, model config, WDA status |
| `scripts/device/` | Device-side services: `start-wda.sh`, `stop-wda.sh`, Appium, Playgrounds |
| `scripts/lib/device-kit.ts` | Product-agnostic Midscene device primitives |
| `scripts/lib/cowallet.ts` | CoWallet adapter: device pinning, run dirs, user-state model, safety context |
| `scripts/t*.ts` | One focused test case per file, named `t<NN>_<journey>_<platform>.ts` |
| `reports/` | Per-run artifacts (`summary.json`, Midscene HTML report, screenshots). Not committed. |
| `findings/` | Curated local issue drafts + evidence screenshots |
| `docs/` | Device preparation and test-plan docs (Chinese, user-facing) |
| `assets/` | Static fixtures for tests |

## Commands that actually work here

```bash
npm run doctor                    # full preflight (no device writes)
npm run doctor:android            # adb + connected devices
npm run doctor:ios                # UDID, WDA, signing identity
npm run doctor -- --probe         # allow starting the adb server before querying devices
npm run wda:check                 # WDA preconditions only, does not start WDA
npm run wda:start                 # build/sign/start WDA (slow on first run)
npm run wda:stop                  # explicit cleanup only
npm run test:android:smoke        # read-only Android smoke (t01)
npm run test:ios:smoke            # read-only iOS smoke (t01)
npm run test:ios:t03              # read-only iOS unauthenticated entry coverage (t03)
npm run test:ios:t14              # read-only iOS guest onboarding scroll map (t14)
npm run test:ios:t04              # read-only iOS email-login page error-state probe (t04)
npm run test:ios:t15              # read-only iOS guest legal pages reachability (t15)
npm run test:ios:t16              # read-only iOS guest language switch (t16)
npm run test:ios:t17              # read-only iOS invite-code entry probe (t17)
npm run test:ios:t04:register     # signup email + OTP, two-phase send/verify (t04)
npm run test:ios:t05              # no-wallet choices probe: help / change email / create wallet (t05)
npm run test:ios:t05b             # create-wallet flow probe, stops before mnemonic boundary (t05b)
npm run test:ios:t05c             # set recovery password → save backup, stops before mnemonic (t05c)
npm run test:ios:t06              # wallet-ready home/nav: three bottom tabs reachable (t06)
npm run test:ios:t07              # wallet-ready AI chat safety: vague/dangerous prompts stay below execution boundary (t07)
npm run test:ios:t08              # wallet-ready settings security items, read-only, never toggles freeze/lock (t08)
npm run test:ios:t10              # wallet-ready 钱包 tab asset empty-state + top/bottom scroll map (t10)
npm run test:ios:t11              # wallet-ready home quick actions 接收/发送/联系人, read-only, never executes (t11)
npm run test:ios:t12              # wallet-ready AI transfer with empty wallet: stays at clarification/no-balance, never signs (t12)
npm run test:ios:t13              # wallet-ready invite/rewards page, read-only, invite code + rewards rule (t13)
npm run test:ios:t18              # wallet-ready AI chat history panel, read-only, no delete/new-chat (t18)
npm run test:ios:t19              # wallet-ready real ETH transfer (authorized): stops at confirm card, Face ID by user (t19)
npm run test:ios:t20              # wallet-ready bg/foreground (Home) AI session & result persistence, read-only (t20)
npm run test:ios:t21              # issue 4 regression: shard naming card vs AI consistency, read-only (t21)
npm run test:ios:t22              # wallet-ready voice input: mic button → permission (user allows) → listening UI → safe stop (t22)
npm run test:ios:t23              # wallet-ready QR scan: 扫码 → camera permission (user allows) → scanner UI → safe close (t23)
npm run test:ios:t24              # issue 2 regression: backup verify via recovery password → third shard "已验证" (t24)
npm run test:ios:t25              # read-only probe: AI security-protection/rotate-key alternative paths (issue 15/3 deep dive) (t25)
npm run test:ios:t26              # issue 14 regression: transfer confirm card address display, stops at card, never executes (t26)
npm run test:ios:t27              # wallet-ready voice one-sentence e2e: mic → (user speaks) → recognized text → send query → observe AI reply, no funds movement (t27)
npm run test:ios:t28              # wallet-ready real-QR e2e: 扫码 → (user points camera at Mac-screen QR) → recognize address → AI flow, stop at confirm boundary (t28)
npm run test:ios:t29              # issue 16 regression: real external ETH receive + background/lockscreen → assert no funds PUSH (only in-app bell), never moves funds (t29)
bash -n scripts/device/*.sh       # shell syntax check
```

There is no test-runner framework here (no vitest/playwright): test cases are `tsx` scripts that exit non-zero on failure, matching the established convention in `../cowallet/blackbox-device-tests`. Prefer reusing that convention over introducing a new runner.

`npm install` has not been run in this repo yet. Ask the user before installing dependencies.

## Test authoring conventions

- Put automation scripts under `scripts/`, helpers under `scripts/lib/`, static fixtures under `assets/`, per-run output under `reports/`.
- Factoring rule: if the same device action appears in more than one script, move it into `scripts/lib/` before adding more inline copies.
- Keep each script to one user journey: one starting state, one primary path, one main assertion set. Split instead of writing one large flow.
- For scrollable surfaces, visible-viewport inspection is not enough: add explicit top/middle/bottom scroll-map coverage with a max-scroll limit, and report entries that stay unreachable.
- Record the starting state in every run. CoWallet has three meaningful states: `fresh-install`, `email-registered-no-wallet`, `wallet-ready`. Do not report a flow as broken before the starting state is confirmed.
- CoWallet is conversation-first: a tap often lands the user back in the AI chat. Assert on visible conversation outcomes (assistant text, clarification prompts, confirmation cards, cancellation paths, error/empty/loading states) instead of guessing internal wallet state.
- Treat buttons and chips inside assistant responses as first-class UI: clarification choices, suggestions, navigation and cancellation may be tapped; anything that would confirm, sign, approve, send, submit, reveal secrets, delete or freeze is the execution boundary and must not be tapped.
- Include negative and ambiguous prompts (missing recipient, unsupported token, unsafe amount, insufficient balance, cancellation, user correction after a clarification question).
- Before drafting transfer/swap prompts, read the visible balances/assets first and pick a token the wallet actually shows. If nothing is transferable, expect an insufficient-balance or clarification path rather than forcing a transaction.
- Verify script changes against a real connected device before claiming they work. If you only ran a syntax or type check, say exactly that.

## Device rules

- **Pin the target device explicitly.** Android: `ANDROID_DEVICE_ID` (the scripts refuse to guess when more than one device is connected). iOS: `IOS_UDID`.
- Never silently switch devices, install/reinstall an APK or IPA, clear app data, grant permissions, unlock the device, reset WDA, or change device settings. These need explicit authorization naming the exact target.
- `adb devices` can start the adb daemon, which is a side effect: `scripts/doctor.mjs` only queries devices when a server is already running, or when `--probe` is passed deliberately.
- Treat WDA as a long-lived service: check `http://127.0.0.1:8100/status`, reuse it when ready, and only stop it as explicit manual cleanup (`npm run wda:stop`).
- Classify failures before repairing: environment (device offline/unauthorized, WDA, signing) vs application vs test script vs unstable AI localization. Repair only test/config when evidence supports it.
- Do not run `adb kill-server`, uninstall apps, or reboot devices as part of an automatic test-repair loop.

## Safety boundaries

The following are irreversible and must stop the script **before** execution, with evidence captured:

real transfer, swap submission, token approval, signing/broadcasting a transaction, revealing or exporting mnemonics/private keys/key shards, account deletion, emergency freeze and other irreversible security-state changes.

- Default gates in `.env` are closed: `MANUAL_CONFIRM_REAL_TRANSFER=false`, `MAX_TEST_TRANSFER_USD=0`.
- A real funds-moving run additionally requires that turn's explicit authorization, an amount under the configured cap, and a receiver matching `TEST_SAFE_EVM_RECEIVER`.
- Test authorization is not transaction authorization: state this explicitly when a case ends at a confirmation or signing screen.
- Never write or echo passwords, API keys, tokens, cookies/session state, private keys, mnemonics, recovery codes or signing material. Secrets come only from the git-ignored local `.env`; never put them in scripts, AI prompts, reports or commits.
- Avoid screenshots that would capture secrets; if a screen shows a secret, stop and share only sanitized evidence.

## Artifacts and findings

- `reports/` and `midscene_run/` are temporary run artifacts: do not commit them unless the user explicitly asks to preserve a full raw run.
- Promote confirmed observations into `findings/` as local drafts (`Status: local-draft`, `Linear: pending`); keep only the needed screenshots under `findings/assets/<run-name>/`.
- Write findings in Chinese first, keeping only exact UI copy in its original language.
- Check for duplicates before proposing a Linear issue, and never create one without user approval.
- Each finding needs: observed behavior, expected behavior, user impact, repro steps, source report path, screenshot links, priority.

## Related repositories

| Repo | Relationship |
| --- | --- |
| `../cowallet` | The application itself. `blackbox-device-tests/` there is the v1.0.2 real-device harness: 100+ per-journey scripts, findings history and Linear workflow. Reuse and adapt from it rather than rewriting from scratch. |
| `../midscene-test-cw` | Source of the WDA/Appium launcher scripts now copied into `scripts/device/`, plus three-platform (extension/iOS/Android) script-splitting experience. |

When porting a v1 script, adapt `rootDir`, `.env` lookups and script paths; keep the business assertions intact. Do not weaken an expected result just to make a ported script pass.

## Keeping this file current

When a build, test, type-check, or lint command actually works in this repo, record it here so the next agent does not rediscover it.
