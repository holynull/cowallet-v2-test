import 'dotenv/config';
import { agentFromWebDriverAgent } from '@midscene/ios';
const agent = await agentFromWebDriverAgent({
  deviceId: process.env.IOS_UDID,
  wdaHost: process.env.WDA_HOST || '127.0.0.1',
  wdaPort: Number(process.env.IOS_WDA_LOCAL_PORT || 8100),
  reportFileName: 'probe-backup-verify',
  testId: 'cowallet-v2-ios-probe',
  autoDismissKeyboard: false,
  aiActContext: 'You are navigating to the backup verification entry and observing its UI. ONLY navigate settings/back and observe. Never type any secret. Never confirm anything.',
});
await agent.launch('app.getcowallet.wallet');
await new Promise(r=>setTimeout(r,3000));
// 复位到设置→密钥检查
for (let i=0;i<4;i++) {
  const st = await agent.aiQuery({ description: '返回 JSON {hasBottomNav: bool, onSettings: bool, onThreeKeys: bool}。只观察。' });
  if (st.onThreeKeys) break;
  if (st.onSettings) { try { await agent.aiTap('the 密钥检查 (Key check) setting item', { deepLocate: true }); } catch(e){} await new Promise(r=>setTimeout(r,2500)); continue; }
  if (st.hasBottomNav) { try { await agent.aiTap('the 设置 (Settings) bottom navigation tab', { deepLocate: true }); } catch(e){} await new Promise(r=>setTimeout(r,2000)); }
  else { const size = await agent.page.size(); await agent.page.tap(Math.round(size.width*0.08), Math.round(size.height*0.09)); await new Promise(r=>setTimeout(r,1800)); }
}
// 观察三份钥匙页的验证入口
const kc = await agent.aiQuery({
  description: '观察当前「三份钥匙」页。返回 JSON {screenPurpose, verifyButton: 是否有「现在花 30 秒测一下」按钮, verifyButtonLabel: 其精确文案, otherButtons: 其它可点按钮文案数组}。只观察。',
});
console.log('THREE-KEYS:', JSON.stringify(kc, null, 2));
// 点验证按钮看下一步（不输入任何内容）
if (kc.verifyButton) {
  try { await agent.aiTap(`the button "${kc.verifyButtonLabel || '现在花 30 秒测一下'}"`, { deepLocate: true }); await new Promise(r=>setTimeout(r,2500)); } catch(e){ console.log('tap verify:', e.message); }
  const next = await agent.aiQuery({
    description: '观察当前界面。返回 JSON {screenPurpose, visibleTexts: [], asksRecoveryPassword: 是否要求输入恢复密码, asksMnemonic: 是否要求输入24个助记词, inputFields: 输入框描述数组, confirmButtons: 按钮文案数组, isSecure: 是否有密码/安全输入框, hasOptionChoice: 是否有 用恢复密码/用助记词 的选择}。只观察，绝对不要输入任何内容或点确认。',
  });
  console.log('NEXT:', JSON.stringify(next, null, 2));
}
await agent.destroy();
