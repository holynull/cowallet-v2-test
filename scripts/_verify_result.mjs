import 'dotenv/config';
import { agentFromWebDriverAgent } from '@midscene/ios';
const deviceId = process.env.IOS_UDID;
const agent = await agentFromWebDriverAgent({
  deviceId,
  wdaHost: process.env.WDA_HOST || '127.0.0.1',
  wdaPort: Number(process.env.IOS_WDA_LOCAL_PORT || 8100),
  reportFileName: 'verify-transfer-result',
  testId: 'cowallet-v2-ios-probe',
  autoDismissKeyboard: false,
  aiActContext: 'You are verifying a transfer result. ONLY observe and describe. Never tap any button.',
});
const desc = await agent.aiQuery({
  description: '观察当前 cowallet 界面。返回 JSON {screenPurpose, visibleTexts: [], transferOutcome: null(若能看到转账成功/失败/广播中/已发出等状态,描述), hasTransferCard: 是否仍有确认卡, hasError: 是否有错误提示}。只观察，不要点击。',
});
console.log(JSON.stringify(desc, null, 2));
await agent.destroy();
