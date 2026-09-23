import { api } from './client';

// 市场调研 API 封装 + 前端消费所需的类型(镜像后端 zod 结构的子集)。

export type Confidence = 'high' | 'medium' | 'low';
// 规格项置信度比模块级多一档 inferred(推断),用于硬件「竞品内部用料/规格」这类无法查实项。
export type SpecConfidence = 'high' | 'medium' | 'low' | 'inferred';
export type ReportStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ResearchPlan = 'economy' | 'balanced' | 'premium';

export interface MoneyValue { value: number; unit: string; note?: string }

export interface ResearchReport {
  productName: string;
  coreQuestion?: string;
  industry?: string;
  marketSize?: {
    tam: MoneyValue; sam: MoneyValue; som: MoneyValue;
    method?: string; assumptions?: string[];
    maturity?: 'education' | 'competition' | 'mature';
    maturityReason?: string; summary: string; confidence?: Confidence; citations?: string[];
  };
  competitors?: {
    competitors: {
      name: string; website?: string | null; productAnalysis?: string; pricing: string;
      monthlyPriceUsd: number | null; features: string[]; acquisitionChannels: string[]; complaints?: string[];
      // 硬件垂直字段(hardware 模板填充)
      formFactor?: string; targetUser?: string; isDirect?: boolean;
      specs?: { name: string; value: string; confidence?: SpecConfidence }[];
    }[];
    summary: string; confidence?: Confidence; citations?: string[];
  };
  userProfile?: {
    segments: string[]; painPoints: string[]; existingSolutions: string[];
    painFrequency?: 'daily' | 'weekly' | 'monthly' | 'occasional';
    painSeverity?: 'low' | 'medium' | 'high';
    willingnessToPay?: { signal: 'low' | 'medium' | 'high'; priceRange: string; reason: string };
    summary: string; confidence?: Confidence; citations?: string[];
  };
  trend?: {
    keywords: { keyword: string; points: { period: string; value: number }[] }[];
    direction: 'rising' | 'stable' | 'declining'; growthSummary: string; confidence?: Confidence; citations?: string[];
  };
  scenarioMap?: {
    scenarios: { name: string; description: string; servedBy?: string[]; saturation: 'crowded' | 'contested' | 'open'; note?: string }[];
    gaps: string[]; summary: string; confidence?: Confidence; citations?: string[];
  };
  barrier?: {
    barriers: { name: string; description: string; difficulty: 'low' | 'medium' | 'high' }[];
    overallDifficulty: 'low' | 'medium' | 'high'; summary: string;
  };
  conclusion?: {
    factors: { name: string; score: number; weight: number; reason: string }[];
    score: number; verdict: string;
    recommendation?: 'go' | 'conditional_go' | 'no_go';
    conditions?: string[]; entryStrategy: string[]; risks: string[]; summary: string;
  };
  meta?: {
    dataCollectedAt: string; methodologyVersion: string; overallConfidence: Confidence;
    template: string; plan: ResearchPlan; sourcedModuleCount: number; moduleCount?: number; rerunOf?: string | null;
  };
}

export interface CostInputs {
  items: { name: string; monthlyCost: number }[];
  targetPrice: number | null;
}

export interface ProjectListItem {
  id: string;
  productName: string;
  status: ReportStatus;
  score: number | null;
  createdAt: string;
}

export interface StepView {
  stepNumber: number;
  stepName: string;
  status: ReportStatus;
  summary: string | null;
  error: string | null;
}

export interface StatusResp {
  reportId: string;
  status: ReportStatus;
  score: number | null;
  steps: StepView[];
}

export interface StartInput {
  productName: string;
  coreQuestion?: string;
  industry?: string;
  plan: ResearchPlan;
  template?: string;
  rerunOf?: string | null;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const { data } = await api.get('/research');
  return data.reports;
}

export async function startResearch(input: StartInput): Promise<string> {
  const { data } = await api.post('/research/start', input);
  return data.reportId;
}

export async function getStatus(id: string): Promise<StatusResp> {
  const { data } = await api.get(`/research/${id}/status`);
  return data;
}

export async function getResult(id: string): Promise<{ result: ResearchReport; costInputs: CostInputs | null; score: number | null }> {
  const { data } = await api.get(`/research/${id}/result`);
  return { result: data.result, costInputs: data.costInputs, score: data.score };
}

export async function saveCostInputs(id: string, cost: CostInputs): Promise<void> {
  await api.patch(`/research/${id}`, cost);
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/research/${id}`);
}

// ───────────────────────  AI 改写(提案 → 应用 → 回滚)  ───────────────────────

/** 可被 AI 改写的报告分区 key,与后端 services/research/revise.js 的 REVISABLE 对齐。 */
export type RevisableSection =
  | 'marketSize' | 'competitors' | 'userProfile' | 'trend' | 'scenarioMap' | 'barrier' | 'conclusion';

export const SECTION_LABELS: Record<RevisableSection, string> = {
  marketSize: '市场规模',
  competitors: '竞品分析',
  userProfile: '用户画像',
  trend: '搜索趋势',
  scenarioMap: '使用场景地图',
  barrier: '进入壁垒',
  conclusion: '综合结论',
};

export interface RevisionProposal {
  revisionId: string;
  section: RevisableSection;
  label: string;
  instruction: string;
  before: unknown;
  after: unknown;
  /** append = 只生成新条目再追加(原有内容零改动);rewrite = 整个分区重写。 */
  mode: 'append' | 'rewrite';
  /** append 模式下新增的条目名。 */
  added: string[];
  /** AI 重写时丢掉、且指令里未提及的条目 —— 已由后端自动补回,仅作告知。 */
  restored: { field: string; items: string[] }[];
  /** 补回后仍缺失的条目(名字在指令里出现过,可能是有意删除),需用户确认后再应用。 */
  warnings: { field: string; dropped: string[] }[];
  createdAt: string;
}

export interface RevisionListItem {
  id: string;
  section: RevisableSection;
  label: string;
  instruction: string;
  status: 'proposed' | 'applied' | 'discarded' | 'rolled_back';
  createdAt: string;
  appliedAt: string | null;
}

// 模型重写整个分区要 60~90s,远超 client.ts 的 15s 全局超时。
// 只给这一个调用放宽,不动全局(否则普通接口出错要吊死 3 分钟)。
const REVISE_TIMEOUT_MS = 180_000;

/** 让 AI 生成分区改写提案(不写回报告,需再调 applyRevision 才生效)。 */
export async function proposeRevision(
  id: string,
  input: { section: RevisableSection; instruction: string; plan?: ResearchPlan }
): Promise<RevisionProposal> {
  const { data } = await api.post(`/research/${id}/revise`, input, { timeout: REVISE_TIMEOUT_MS });
  return data;
}

export async function listRevisions(id: string): Promise<RevisionListItem[]> {
  const { data } = await api.get(`/research/${id}/revisions`);
  return data.revisions;
}

/** 应用提案,返回写回后的完整报告。 */
export async function applyRevision(id: string, revisionId: string): Promise<ResearchReport> {
  const { data } = await api.post(`/research/${id}/revisions/${revisionId}/apply`);
  return data.result;
}

/** 回滚一次已应用的改写,返回回滚后的完整报告。 */
export async function rollbackRevision(id: string, revisionId: string): Promise<ResearchReport> {
  const { data } = await api.post(`/research/${id}/revisions/${revisionId}/rollback`);
  return data.result;
}

export async function discardRevision(id: string, revisionId: string): Promise<void> {
  await api.delete(`/research/${id}/revisions/${revisionId}`);
}

// 导出 Markdown:用 axios(带 Bearer)取 blob,再触发下载。
export async function exportMarkdown(id: string): Promise<void> {
  const { data } = await api.get(`/research/${id}/export`, { params: { format: 'md' }, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `market-research-${id.slice(0, 8)}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
