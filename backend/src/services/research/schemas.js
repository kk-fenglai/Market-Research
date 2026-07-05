// 全部结构化 schema 的单一事实来源(决定 6 步输出什么、前端消费什么)。
// 从原 Next.js 项目 lib/schemas.ts 移植为 CommonJS。
const { z } = require('zod');

/** 方法论版本:写入报告 meta,改了算法老报告不"漂移"。 */
const METHODOLOGY_VERSION = '1.0';

const Confidence = z.enum(['high', 'medium', 'low']);

/** 机会评分的固定权重(权重由我们定死,LLM 只打子分)。 */
const SCORE_WEIGHTS = [
  { name: '市场规模', weight: 0.25 },
  { name: '竞争格局', weight: 0.2 },
  { name: '趋势', weight: 0.2 },
  { name: '进入壁垒', weight: 0.2 },
  { name: '用户痛点', weight: 0.15 },
];

const ResearchTemplate = z.enum([
  'generic', 'b2b_saas', 'consumer', 'marketplace',
  'ai_tool', 'dev_tool', 'content_media', 'education',
  'ecommerce', 'fintech', 'community', 'hardware',
]);

const ResearchPlan = z.enum(['economy', 'balanced', 'premium']);

const ResearchInput = z.object({
  productName: z.string().min(1).max(120),
  coreQuestion: z.string().max(500).optional(),
  industry: z.string().max(80).optional(),
  plan: ResearchPlan.default('economy'),
  template: ResearchTemplate.default('generic'),
  rerunOf: z.string().nullable().optional(),
});

// ── Step 1:市场规模(TAM/SAM/SOM) ──
const MoneyValue = z.object({
  value: z.number(),
  unit: z.string(),
  note: z.string().optional(),
});
const MarketMaturity = z.enum(['education', 'competition', 'mature']);
const MarketSizeResult = z.object({
  tam: MoneyValue,
  sam: MoneyValue,
  som: MoneyValue,
  method: z.enum(['top_down', 'bottom_up', 'mixed']).default('mixed'),
  assumptions: z.array(z.string()).default([]),
  maturity: MarketMaturity.optional(),
  maturityReason: z.string().optional(),
  summary: z.string(),
  confidence: Confidence.default('medium'),
  citations: z.array(z.string()).default([]),
});

// ── Step 2:竞品分析 ──
// 规格项置信度比模块级多一档 inferred(推断):用于「竞品用了什么料/内部规格」
// 这类无法查实、只能从公开信息推断的项。UI/导出必须把 inferred 与查实项视觉隔离(PRD §7.5/§9.3)。
const SpecConfidence = z.enum(['high', 'medium', 'low', 'inferred']);
const CompetitorSpec = z.object({
  name: z.string(),                              // 规格项,如「屏幕」「续航」「主控」「接口」
  value: z.string(),                             // 取值
  confidence: SpecConfidence.default('medium'),  // inferred=推断,非查实
});
const Competitor = z.object({
  name: z.string(),
  website: z.string().nullable().optional().default(null),
  productAnalysis: z.string().optional().default(''),
  pricing: z.string(),
  monthlyPriceUsd: z.number().nullable(),
  features: z.array(z.string()),
  acquisitionChannels: z.array(z.string()),
  complaints: z.array(z.string()).default([]),
  // ── 硬件垂直字段(hardware 模板填充;其余模板留空,向后兼容)──
  formFactor: z.string().optional().default(''),    // 形态(尺寸/材质/装配方式)
  targetUser: z.string().optional().default(''),    // 目标人群
  isDirect: z.boolean().optional().default(false),  // 是否直接竞品(报告页高亮)
  specs: z.array(CompetitorSpec).default([]),        // 结构化规格 → 差异化对比矩阵
});
const CompetitorResult = z.object({
  competitors: z.array(Competitor),
  summary: z.string(),
  confidence: Confidence.default('medium'),
  citations: z.array(z.string()).default([]),
});

// ── Step 3:用户画像 + 需求强度 ──
const PainFrequency = z.enum(['daily', 'weekly', 'monthly', 'occasional']);
const WillingnessToPay = z.object({
  signal: z.enum(['low', 'medium', 'high']),
  priceRange: z.string(),
  reason: z.string(),
});
const UserProfileResult = z.object({
  segments: z.array(z.string()),
  painPoints: z.array(z.string()),
  existingSolutions: z.array(z.string()),
  painFrequency: PainFrequency.optional(),
  painSeverity: z.enum(['low', 'medium', 'high']).optional(),
  willingnessToPay: WillingnessToPay.optional(),
  summary: z.string(),
  confidence: Confidence.default('medium'),
  citations: z.array(z.string()).default([]),
});

// ── Step 4:搜索趋势 ──
const TrendPoint = z.object({ period: z.string(), value: z.number() });
const KeywordTrend = z.object({ keyword: z.string(), points: z.array(TrendPoint) });
const TrendResult = z.object({
  keywords: z.array(KeywordTrend),
  direction: z.enum(['rising', 'stable', 'declining']),
  growthSummary: z.string(),
  confidence: Confidence.default('medium'),
  citations: z.array(z.string()).default([]),
});

// ── 使用场景地图(hardware 模板专属采集步) ──
// 把「这个品类有哪些使用场景、谁在打、哪儿还空着」画成地图,直接导出市场缺口(PRD §7.4)。
const ScenarioSaturation = z.enum(['crowded', 'contested', 'open']); // 拥挤 / 竞争 / 空白
const Scenario = z.object({
  name: z.string(),                                   // 场景名,如「桌面摆放·看天气」
  description: z.string(),                             // 场景描述
  servedBy: z.array(z.string()).default([]),          // 哪些竞品/产品在打这个场景
  saturation: ScenarioSaturation.default('contested'),
  note: z.string().optional().default(''),
});
const ScenarioMapResult = z.object({
  scenarios: z.array(Scenario).default([]),
  gaps: z.array(z.string()).default([]),              // 未被满足的场景/差异化切口候选
  summary: z.string(),
  confidence: Confidence.default('medium'),
  citations: z.array(z.string()).default([]),
});

// ── Step 5:进入壁垒 ──
const DifficultyLevel = z.enum(['low', 'medium', 'high']);
const Barrier = z.object({
  name: z.string(),
  description: z.string(),
  difficulty: DifficultyLevel,
});
const BarrierResult = z.object({
  barriers: z.array(Barrier),
  overallDifficulty: DifficultyLevel,
  summary: z.string(),
});

// ── Step 6:综合结论(LLM 只出子分,总分由代码按权重算) ──
const ConclusionDraft = z.object({
  factors: z.array(z.object({
    name: z.string(),
    score: z.number().min(0).max(100),
    reason: z.string(),
  })),
  verdict: z.string(),
  recommendation: z.enum(['go', 'conditional_go', 'no_go']).default('conditional_go'),
  conditions: z.array(z.string()).default([]),
  entryStrategy: z.array(z.string()),
  risks: z.array(z.string()),
  summary: z.string(),
});

const ScoreFactor = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  weight: z.number(),
  reason: z.string(),
});
const ConclusionResult = z.object({
  factors: z.array(ScoreFactor).default([]),
  score: z.number().min(0).max(100),
  verdict: z.string(),
  recommendation: z.enum(['go', 'conditional_go', 'no_go']).default('conditional_go'),
  conditions: z.array(z.string()).default([]),
  entryStrategy: z.array(z.string()),
  risks: z.array(z.string()),
  summary: z.string(),
});

// ── 成本 & 定价(用户手动录入,USD;非 LLM 生成) ──
const CostItem = z.object({
  name: z.string().min(1).max(60),
  monthlyCost: z.number().min(0),
});
const CostInputs = z.object({
  items: z.array(CostItem).max(50).default([]),
  targetPrice: z.number().min(0).nullable().default(null),
});

// ── 报告元信息 ──
const ReportMeta = z.object({
  dataCollectedAt: z.string(),
  methodologyVersion: z.string(),
  overallConfidence: Confidence,
  template: ResearchTemplate.default('generic'),
  plan: ResearchPlan.default('economy'),
  sourcedModuleCount: z.number().default(0),
  moduleCount: z.number().default(4),   // 采集模块总数(hardware 含场景图 = 5)
  rerunOf: z.string().nullable().default(null),
});

// ── 聚合报告:前端直接消费 ──
const ResearchReport = z.object({
  productName: z.string(),
  coreQuestion: z.string().optional(),
  industry: z.string().optional(),
  marketSize: MarketSizeResult.optional(),
  competitors: CompetitorResult.optional(),
  userProfile: UserProfileResult.optional(),
  trend: TrendResult.optional(),
  scenarioMap: ScenarioMapResult.optional(),
  barrier: BarrierResult.optional(),
  conclusion: ConclusionResult.optional(),
  meta: ReportMeta.optional(),
});

module.exports = {
  METHODOLOGY_VERSION,
  SCORE_WEIGHTS,
  Confidence,
  ResearchTemplate,
  ResearchPlan,
  ResearchInput,
  MarketSizeResult,
  CompetitorResult,
  SpecConfidence,
  UserProfileResult,
  TrendResult,
  ScenarioMapResult,
  BarrierResult,
  ConclusionDraft,
  ConclusionResult,
  CostInputs,
  ReportMeta,
  ResearchReport,
};
