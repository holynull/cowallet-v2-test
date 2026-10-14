/**
 * 数据集行 → 飞书 issue list 字段的映射。
 *
 * 选项名一律沿用既有 issue list（v1.6.4 / v1.6.7 / v1.6.8）的取值，不新增选项，
 * 避免同一个 Base 里出现两套分类口径。
 */

export const CATEGORY_MAP = {
  产品缺陷: '产品缺陷',
  交互与文案: '产品缺陷',
  设计差异: '设计差异',
  安全审查: '产品缺陷',
  测试数据前置: '测试数据/前置条件',
  自动化断言: '自动化/断言',
};

export const FEEDBACK_STATUS_MAP = {
  待反馈: '待反馈',
  处理中: '处理中',
  已修复待回归: '待回归',
  待回归关闭: '待回归',
  已提交工单: '处理中',
  无需处理: '无需处理',
};

/** 文档里既有真机问题，也有代码审查发现，用一列区分开。 */
export const PROBLEM_TYPE_MAP = {
  安全审查: '代码审查',
};

export function problemType(row) {
  return PROBLEM_TYPE_MAP[row.category] ?? '功能问题';
}

export function platformValue(platforms = []) {
  if (platforms.length === 0) return undefined;
  if (platforms.length === 1) return platforms[0];
  return '双端';
}

export function issueNote(row) {
  return [
    row.detail,
    row.rawLine ? `文档原文：${row.rawLine}` : '',
    row.foundInVersion ? `发现版本：${row.foundInVersion}` : '',
    row.source ? `来源：${row.source}` : '',
    row.ticket ? `Linear：${row.ticket}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 只产出文字类字段；附件字段由调用方按需附加，避免误清空已有附件。 */
export function rowToFields(row, attachments) {
  const fields = {
    序号: row.sequence,
    Issue: row.title,
    Issue备注: issueNote(row),
    影响: row.impact,
  };
  const platform = platformValue(row.platforms);
  if (platform) fields.平台 = platform;
  if (row.title) fields.问题类型 = problemType(row);
  if (row.severity) fields.严重程度 = row.severity;
  if (row.docState) fields.文档标注状态 = row.docState;
  if (row.codeLocation) fields.代码位置 = row.codeLocation;
  const category = CATEGORY_MAP[row.category];
  if (category) fields.问题归类 = category;
  const feedbackStatus = FEEDBACK_STATUS_MAP[row.issueStatus];
  if (feedbackStatus) fields.反馈状态 = feedbackStatus;
  if (row.devNote) fields.反馈备注 = row.devNote;
  if (row.regressionStatus) fields.回归验证状态 = row.regressionStatus;
  if (row.regressionNote) fields.回归备注 = row.regressionNote;
  for (const [field, tokens] of Object.entries(attachments ?? {})) {
    fields[field] = tokens.map((file_token) => ({ file_token }));
  }
  return fields;
}
