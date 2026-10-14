/**
 * 《Cowallet v2 测试》文档截图 → Issue 序号的映射。
 *
 * 图片由 fetch 脚本用 docx blocks + drive medias 接口下载到
 *   findings/assets/cowallet-v2-round1/
 * 并逐张人工核对过内容（不是按顺序硬塞）：
 *   序号 2 iCloud/第三片      ← 01-image.png（安全卡片提示「这台手机没登录 iCloud」）
 *   序号 3 轮换密钥失败        ← 02-image.jpg（设置页 toast「钥匙轮转失败」）
 *   序号 4 三个分片表述不一致  ← 03-image.png（AI 答「本机/云备份/恢复分片」）+ 04-image.png（卡片写「手机/服务器/你保管」）
 *   序号 5 ETH 转账失败        ← 05-image.png（chain_unreachable 之后仍回复「卡片发出去了」）
 * 序号 1（收款无消息提示）文档里没有配图。
 */

export const V2_EVIDENCE_DIR = ['findings', 'assets', 'cowallet-v2-round1'];

export const V2_EVIDENCE_MAPPING = [
  { sequence: '2', issue: 'iCloud 已登录，但第三片提示未登录、无法备份', files: ['01-image.png'] },
  { sequence: '3', issue: '轮换密钥失败', files: ['02-image.jpg'] },
  { sequence: '4', issue: '三个分片的表述不一致', files: ['03-image.png', '04-image.png'] },
  { sequence: '5', issue: 'ETH 转账失败', files: ['05-image.png'] },
];
