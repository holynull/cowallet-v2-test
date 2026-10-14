import 'dotenv/config';
import { agentFromWebDriverAgent } from '@midscene/ios';
const deviceId = process.env.IOS_UDID;
const agent = await agentFromWebDriverAgent({
  deviceId,
  wdaHost: process.env.WDA_HOST || '127.0.0.1',
  wdaPort: Number(process.env.IOS_WDA_LOCAL_PORT || 8100),
  reportFileName: 'balance-after-transfer',
  testId: 'cowallet-v2-ios-probe',
  autoDismissKeyboard: false,
  aiActContext: 'You are checking the wallet balance. ONLY observe. Never tap any button.',
});
await agent.aiTap('the 钱包 (Wallet) bottom navigation tab', { deepLocate: true });
await new Promise(r=>setTimeout(r,2500));
const desc = await agent.aiQuery({
  description: '观察当前 cowallet 钱包 tab。返回 JSON {totalAssets, ethereum: {token: null, amount: null, usd: null}, base: {token: null, amount: null, usd: null}, visibleTexts: []}。只观察。',
});
console.log(JSON.stringify(desc, null, 2));
await agent.destroy();
