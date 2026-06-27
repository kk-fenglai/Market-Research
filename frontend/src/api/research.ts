import { api } from './client';

// 市场调研 API 封装 + 前端消费所需的类型(镜像后端 zod 结构的子集)。

export type Confidence = 'high' | 'medium' | 'low';
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
    competitors: { name: string; website?: string | null; pricing: string; monthlyPriceUsd: number | null; features: string[]; acquisitionChannels: string[]; complaints?: string[] }[];
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
    template: string; plan: ResearchPlan; sourcedModuleCount: number; rerunOf?: string | null;
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
