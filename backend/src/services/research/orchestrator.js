// 调研编排 —— 6 步流水线(Prisma 版,替代原 Inngest)。
// Step 1-4 并行采集,Step 5-6 串行推理(provider 由 plan 决定,见 services/ai/router)。
// 部分失败策略:采集步失败只标记该步 failed,不阻塞其余;编排跑完即 completed。
//
// 运行方式:Express 长进程内 fire-and-forget(路由里调用但不 await)。
// 与原 Serverless+Inngest 不同 —— 长进程下进程内异步即可,无需外部队列。
// 代价:进程在报告运行中重启会留下 'running' 孤儿(可后续加恢复 sweep)。
const prisma = require('../../prisma');
const { logger } = require('../../utils/logger');
const { PLANS } = require('../ai/router');
const {
  MarketSizeResult, CompetitorResult, UserProfileResult, TrendResult,
  BarrierResult, ConclusionDraft, ResearchReport,
  SCORE_WEIGHTS, METHODOLOGY_VERSION,
} = require('./schemas');
const {
  buildMarketSizePrompt, buildCompetitorPrompt, buildUserProfilePrompt,
  buildTrendPrompt, buildBarrierPrompt, buildConclusionPrompt,
} = require('./prompts');

const STEP_NAMES = {
  1: '市场规模估算',
  2: '竞品分析',
  3: '用户画像提炼',
  4: '搜索趋势分析',
  5: '进入壁垒评估',
  6: '综合结论',
};

async function markStepRunning(reportId, n) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'running' },
  });
}
async function markStepCompleted(reportId, n, data) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'completed', data, completedAt: new Date() },
  });
}
async function markStepFailed(reportId, n, error) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'failed', error: String(error).slice(0, 1000) },
  });
}

/** 预置 6 行 pending(幂等)。 */
async function seedSteps(reportId) {
  await prisma.researchStep.createMany({
    data: Object.entries(STEP_NAMES).map(([n, name]) => ({
      reportId, stepNumber: Number(n), stepName: name, status: 'pending',
    })),
    skipDuplicates: true,
  });
}

/** 采集步:running → 调模型 → 成功写 completed+data / 失败写 failed。失败返回 undefined。 */
async function runCollectionStep(reportId, n, prompt, schema, collect) {
  await markStepRunning(reportId, n);
  try {
    const { data, citations } = await collect(prompt, schema);
    // 优先用 provider 真实引用(Perplexity);为空时保留模型自报 citations。
    const existing = data.citations ?? [];
    const merged = { ...data, citations: citations.length ? citations : existing };
    await markStepCompleted(reportId, n, merged);
    return merged;
  } catch (err) {
    logger.error({ reportId, step: n, err: err && err.message }, 'orchestrator.collect.fail');
    await markStepFailed(reportId, n, err && err.message);
    return undefined;
  }
}

/** 推理步,失败同样标记 failed 并返回 undefined。 */
async function runAnalysisStep(reportId, n, prompt, schema, reason) {
  await markStepRunning(reportId, n);
  try {
    const data = await reason(prompt, schema);
    await markStepCompleted(reportId, n, data);
    return data;
  } catch (err) {
    logger.error({ reportId, step: n, err: err && err.message }, 'orchestrator.reason.fail');
    await markStepFailed(reportId, n, err && err.message);
    return undefined;
  }
}

const clamp = (n) => Math.max(0, Math.min(100, n));

/** 把 Step6 草稿富化为最终结论:注入固定权重 + 代码计算总分。 */
function enrichConclusion(draft) {
  if (!draft) return undefined;
  const factors = SCORE_WEIGHTS.map((w) => {
    const f = draft.factors.find((x) => x.name === w.name);
    return {
      name: w.name,
      score: f ? clamp(f.score) : 0,
      weight: w.weight,
      reason: f?.reason ?? '数据不足,未评分',
    };
  });
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
  return {
    factors, score, verdict: draft.verdict,
    recommendation: draft.recommendation ?? 'conditional_go',
    conditions: draft.conditions ?? [],
    entryStrategy: draft.entryStrategy, risks: draft.risks, summary: draft.summary,
  };
}

/** 质量门禁:模块虽返回但关键内容为空时,强制降为低置信。 */
function gate(m, isEmpty) {
  if (!m) return undefined;
  return isEmpty(m) ? { ...m, confidence: 'low' } : m;
}

/** 整体置信度:缺模块多 / 低置信多 → low;全到齐且都 high → high;否则 medium。 */
function deriveConfidence(modules) {
  const present = modules.filter(Boolean);
  if (present.length === 0) return 'low';
  const confs = present.map((m) => m.confidence ?? 'medium');
  const missing = modules.length - present.length;
  const lowCount = confs.filter((c) => c === 'low').length;
  if (missing >= 2 || lowCount >= 2) return 'low';
  if (missing === 0 && confs.every((c) => c === 'high')) return 'high';
  return 'medium';
}

/**
 * 跑完整 6 步流水线。fire-and-forget:调用方不 await,失败已内部捕获。
 * @param {string} reportId
 * @param {{productName,coreQuestion,industry,plan,template,rerunOf}} input
 */
async function runResearch(reportId, input) {
  const { productName, coreQuestion, industry, plan, template = 'generic', rerunOf = null } = input;
  const planCfg = PLANS[plan] || PLANS.economy;
  const { collect, reason } = planCfg;
  const ctx = { productName, coreQuestion, industry, plan, template };

  try {
    await prisma.researchReport.update({ where: { id: reportId }, data: { status: 'running' } });
    await seedSteps(reportId);

    // Step 1-4:并行采集
    const [marketSize, competitors, userProfile, trend] = await Promise.all([
      runCollectionStep(reportId, 1, buildMarketSizePrompt(ctx), MarketSizeResult, collect),
      runCollectionStep(reportId, 2, buildCompetitorPrompt(ctx), CompetitorResult, collect),
      runCollectionStep(reportId, 3, buildUserProfilePrompt(ctx), UserProfileResult, collect),
      runCollectionStep(reportId, 4, buildTrendPrompt(ctx), TrendResult, collect),
    ]);

    const collected = {
      marketSize: marketSize ?? undefined,
      competitors: competitors ?? undefined,
      userProfile: userProfile ?? undefined,
      trend: trend ?? undefined,
    };

    // Step 5-6:串行推理
    const barrier = await runAnalysisStep(reportId, 5, buildBarrierPrompt(ctx, collected), BarrierResult, reason);
    const conclusionDraft = await runAnalysisStep(reportId, 6, buildConclusionPrompt(ctx, collected), ConclusionDraft, reason);

    // 聚合 + 落库
    const conclusion = enrichConclusion(conclusionDraft ?? undefined);
    const mkt = gate(marketSize, (m) => !m.tam?.value);
    const cmp = gate(competitors, (m) => m.competitors.length === 0);
    const usr = gate(userProfile, (m) => m.segments.length === 0 && m.painPoints.length === 0);
    const trd = gate(trend, (m) => m.keywords.length === 0);
    const collectedModules = [mkt, cmp, usr, trd];
    const meta = {
      dataCollectedAt: new Date().toISOString(),
      methodologyVersion: METHODOLOGY_VERSION,
      overallConfidence: deriveConfidence(collectedModules),
      template,
      plan,
      sourcedModuleCount: collectedModules.filter((m) => m?.citations?.length).length,
      rerunOf: rerunOf ?? null,
    };
    const report = ResearchReport.parse({
      productName, coreQuestion, industry,
      marketSize: mkt, competitors: cmp, userProfile: usr, trend: trd,
      barrier, conclusion, meta,
    });
    await prisma.researchReport.update({
      where: { id: reportId },
      data: { status: 'completed', score: conclusion?.score ?? null, result: report, completedAt: new Date() },
    });
    logger.info({ reportId, score: conclusion?.score ?? null }, 'orchestrator.completed');
  } catch (err) {
    logger.error({ reportId, err: err && err.message }, 'orchestrator.failed');
    await prisma.researchReport.update({ where: { id: reportId }, data: { status: 'failed' } }).catch(() => null);
  }
}

module.exports = { runResearch };
