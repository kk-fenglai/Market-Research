// 6 步 prompt builder。每个强制模型按对应 zod schema 输出纯 JSON。
// 从原 lib/prompts.ts 移植为 CommonJS。
const { SCORE_WEIGHTS } = require('./schemas');

function jsonRule(shape) {
  return [
    '',
    '严格要求:只输出一个 JSON 对象,不要任何解释文字、不要 markdown 代码块包裹。',
    'JSON 必须精确匹配以下结构(字段名/类型一致;数组可为空但键必须存在):',
    shape,
  ].join('\n');
}

function sourcingRule() {
  return [
    '',
    '可信要求:',
    '- citations 必须是真实可访问的 URL;无法联网或查不到可靠来源时,citations 留空数组并将 confidence 设为 low。',
    '- 数据不足时,如实把 confidence 设为 low 并在 summary 说明,严禁编造具体数字。',
  ].join('\n');
}

const TEMPLATE_GUIDANCE = {
  generic: '',
  b2b_saas: '业务类型 B2B SaaS:侧重获客成本/销售周期、定价分层、留存与扩张收入、集成生态。',
  consumer: '业务类型 消费品:侧重获客渠道与传播性、留存与复购、品牌口碑、单位经济。',
  marketplace: '业务类型 双边市场:侧重供需两侧冷启动、网络效应、take rate、跨边补贴与流动性。',
  ai_tool: '业务类型 AI 工具/应用:侧重模型成本与毛利、token 单位经济、与大厂/开源的差异化护城河、被快速复制风险、订阅与用量计费。',
  dev_tool: '业务类型 开发者工具:侧重开发者获客(内容/开源/社区)、自下而上渗透、付费转化与团队扩张、生态集成。',
  content_media: '业务类型 内容/媒体:侧重流量获取与分发渠道、更新频率与留存、变现方式(广告/订阅/带货)、内容护城河。',
  education: '业务类型 教育培训:侧重获客成本与口碑传播、完课率与复购、内容/师资壁垒、合规资质。',
  ecommerce: '业务类型 电商/DTC 品牌:侧重选品与供应链、获客成本与复购、客单价与毛利、平台依赖与品牌沉淀。',
  fintech: '业务类型 金融科技:侧重合规与牌照、风控、信任与获客成本、资金成本与单位经济。',
  community: '业务类型 社区/会员订阅:侧重冷启动与活跃度、网络效应与留存、订阅续费、内容与关系沉淀。',
  hardware: '业务类型 硬件/智能设备:侧重供应链与 BOM 成本、毛利与库存周转、渠道、研发周期与迭代风险。',
};

function subjectLine(input) {
  const parts = [`产品/方向:${input.productName}`];
  if (input.industry) parts.push(`行业:${input.industry}`);
  if (input.coreQuestion) parts.push(`核心问题:${input.coreQuestion}`);
  const g = TEMPLATE_GUIDANCE[input.template];
  if (g) parts.push(g);
  return parts.join(';');
}

function buildMarketSizePrompt(input) {
  return [
    `你是市场分析师。针对【${subjectLine(input)}】估算市场规模。`,
    '给出 TAM/SAM/SOM 的数值与单位(note 标注年份/地域口径),并附数据来源。',
    '标明测算口径 method(top_down=自上而下从大盘拆分 / bottom_up=自下而上从单价×用户数推算 / mixed=两者结合),',
    '并在 assumptions 列出 2-4 条关键假设(如单价、渗透率、目标地域),让数字可被复核。',
    '判断市场成熟度 maturity(education=教育期,需教育用户 / competition=竞争期,主要抢份额 / mature=成熟期,靠差异化与效率),',
    '依据竞品密度、媒体声量、投融资活跃度等给出,并在 maturityReason 一句话说明判断理由。',
    sourcingRule(),
    jsonRule(`{
  "tam": { "value": number, "unit": string, "note": string },
  "sam": { "value": number, "unit": string, "note": string },
  "som": { "value": number, "unit": string, "note": string },
  "method": "top_down" | "bottom_up" | "mixed",
  "assumptions": string[],
  "maturity": "education" | "competition" | "mature",
  "maturityReason": string,
  "summary": string,
  "confidence": "high" | "medium" | "low",
  "citations": string[]
}`),
  ].join('\n');
}

function buildCompetitorPrompt(input) {
  return [
    `针对【${subjectLine(input)}】识别 5-10 个主要竞品。`,
    '每个竞品给出:名称、官方网站完整 URL(website,以 https:// 开头;不确定则填 null,不要编造)、定价描述、可估算的月费(美元;免费或未知填 null)、核心功能、主要获客渠道。',
    '并从评论区/社媒/论坛提取该竞品最常被用户抱怨的 1-3 条差评点(complaints),这是差异化切入口;查不到则留空数组。',
    sourcingRule(),
    jsonRule(`{
  "competitors": [
    { "name": string, "website": string | null, "pricing": string, "monthlyPriceUsd": number | null, "features": string[], "acquisitionChannels": string[], "complaints": string[] }
  ],
  "summary": string,
  "confidence": "high" | "medium" | "low",
  "citations": string[]
}`),
  ].join('\n');
}

function buildUserProfilePrompt(input) {
  return [
    `针对【${subjectLine(input)}】提炼目标用户画像与需求强度。`,
    '给出:目标人群细分、核心痛点、当前已有的替代解决方案。',
    '评估需求强度:痛点频率 painFrequency(daily/weekly/monthly/occasional,用户多久遇到一次这个问题),',
    '痛点严重程度 painSeverity(low/medium/high,不解决会造成的时间/金钱/结果/情绪损失大小)。',
    '评估付费意愿 willingnessToPay:signal(low/medium/high)、价格接受区间 priceRange(如「¥30-80/月」)、判断依据 reason;',
    '可参考竞品价格带、公开调研、社区讨论推断,数据不足时给保守值并在 reason 说明。',
    sourcingRule(),
    jsonRule(`{
  "segments": string[],
  "painPoints": string[],
  "existingSolutions": string[],
  "painFrequency": "daily" | "weekly" | "monthly" | "occasional",
  "painSeverity": "low" | "medium" | "high",
  "willingnessToPay": { "signal": "low" | "medium" | "high", "priceRange": string, "reason": string },
  "summary": string,
  "confidence": "high" | "medium" | "low",
  "citations": string[]
}`),
  ].join('\n');
}

function buildTrendPrompt(input) {
  return [
    `针对【${subjectLine(input)}】分析相关关键词的搜索/需求趋势。`,
    '给出 2-4 个关键词,每个含按时间排列的相对热度数据点(可画折线图),并判断整体走势 rising/stable/declining。',
    sourcingRule(),
    jsonRule(`{
  "keywords": [ { "keyword": string, "points": [ { "period": string, "value": number } ] } ],
  "direction": "rising" | "stable" | "declining",
  "growthSummary": string,
  "confidence": "high" | "medium" | "low",
  "citations": string[]
}`),
  ].join('\n');
}

function collectedContext(input, data) {
  return [
    `调研主题:${subjectLine(input)}`,
    '以下是已采集的结构化数据(可能有模块缺失,缺失即表示该步未成功,请基于现有数据推理):',
    JSON.stringify(data, null, 2),
  ].join('\n');
}

function buildBarrierPrompt(input, data) {
  return [
    '你是资深创业顾问。基于以下市场数据,评估进入该市场的壁垒。',
    collectedContext(input, data),
    '列出关键壁垒(资金/技术/品牌/渠道/合规等),每条标注难度 low/medium/high,并给出整体难度。',
    jsonRule(`{
  "barriers": [ { "name": string, "description": string, "difficulty": "low" | "medium" | "high" } ],
  "overallDifficulty": "low" | "medium" | "high",
  "summary": string
}`),
  ].join('\n');
}

function buildConclusionPrompt(input, data) {
  const factorNames = SCORE_WEIGHTS.map((w) => `${w.name}(权重${Math.round(w.weight * 100)}%)`).join('、');
  return [
    '你是资深创业顾问。基于以下全部市场数据,给出有观点的综合结论。',
    collectedContext(input, data),
    `按以下 5 个固定维度各打 0-100 分并给出理由,维度 name 必须精确为:市场规模、竞争格局、趋势、进入壁垒、用户痛点。参考权重:${factorNames}。`,
    '总分由系统按固定权重自动计算,你不要输出总分。再给出一句话结论、建议进入策略、风险提示。',
    '给出明确决策信号 recommendation(go=值得进入 / conditional_go=有条件进入 / no_go=不建议),',
    '并在 conditions 列出 2-4 条触发条件或止损线(如「若 6 个月内 CAC 高于 X 则放弃」),让结论可执行。',
    '若某维度数据不足,给出保守分数并在 reason 说明,不要凭空乐观。',
    jsonRule(`{
  "factors": [ { "name": string, "score": number, "reason": string } ],
  "verdict": string,
  "recommendation": "go" | "conditional_go" | "no_go",
  "conditions": string[],
  "entryStrategy": string[],
  "risks": string[],
  "summary": string
}`),
  ].join('\n');
}

module.exports = {
  buildMarketSizePrompt,
  buildCompetitorPrompt,
  buildUserProfilePrompt,
  buildTrendPrompt,
  buildBarrierPrompt,
  buildConclusionPrompt,
};
