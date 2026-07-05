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
  ScenarioMapResult, BarrierResult, ConclusionDraft, ResearchReport,
  SCORE_WEIGHTS, METHODOLOGY_VERSION,
} = require('./schemas');
const {
  buildMarketSizePrompt, buildCompetitorPrompt, buildUserProfilePrompt,
  buildTrendPrompt, buildScenarioMapPrompt, buildBarrierPrompt, buildConclusionPrompt,
} = require('./prompts');

// 步骤名按模板而定:hardware 在采集阶段多一步「使用场景地图」(step 5),
// 壁垒/结论顺延为 6/7;其余模板维持原 6 步,向后兼容。
function stepNamesFor(isHardware) {
  return isHardware
    ? { 1: '市场规模估算', 2: '竞品规格分析', 3: '用户画像提炼', 4: '搜索趋势分析', 5: '使用场景地图', 6: '进入壁垒评估', 7: '综合结论' }
    : { 1: '市场规模估算', 2: '竞品分析', 3: '用户画像提炼', 4: '搜索趋势分析', 5: '进入壁垒评估', 6: '综合结论' };
}

async function markStepRunning(reportId, n) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'running' },
  });
}
async function markStepCompleted(reportId, n, data, summary) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'completed', data, summary: summary ?? null, completedAt: new Date() },
  });
}
async function markStepFailed(reportId, n, error) {
  await prisma.researchStep.updateMany({
    where: { reportId, stepNumber: n },
    data: { status: 'failed', error: String(error).slice(0, 1000) },
  });
}

/** 预置步骤行 pending(幂等)。步骤集合由模板决定。 */
async function seedSteps(reportId, names) {
  await prisma.researchStep.createMany({
    data: Object.entries(names).map(([n, name]) => ({
      reportId, stepNumber: Number(n), stepName: name, status: 'pending',
    })),
    skipDuplicates: true,
  });
}

/**
 * 采集步:running → 调模型 → 成功写 completed+data / 失败写 failed。失败返回 undefined。
 * summarize(merged) 可选,返回一句进度摘要写入 step.summary,供生成屏「流式」展示
 * 已发现内容(PRD §7.3);竞品步返回竞品名列表(以 ' · ' 分隔)。
 */
async function runCollectionStep(reportId, n, prompt, schema, collect, summarize) {
  await markStepRunning(reportId, n);
  try {
    const { data, citations } = await collect(prompt, schema);
    // 优先用 provider 真实引用(Perplexity);为空时保留模型自报 citations。
    const existing = data.citations ?? [];
    const merged = { ...data, citations: citations.length ? citations : existing };
    let summary;
    try { summary = summarize ? summarize(merged) : undefined; } catch { summary = undefined; }
    await markStepCompleted(reportId, n, merged, summary);
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
  const isHardware = template === 'hardware';
  // 推理步号随模板偏移:hardware 多一个采集步(场景图=5),壁垒/结论后移。
  const barrierStep = isHardware ? 6 : 5;
  const conclusionStep = isHardware ? 7 : 6;

  try {
    await prisma.researchReport.update({ where: { id: reportId }, data: { status: 'running' } });
    await seedSteps(reportId, stepNamesFor(isHardware));

    // 采集阶段并行:通用 4 步;hardware 额外跑「使用场景地图」(step 5)。
    // 第 6 个参数 = 进度摘要器,写入 step.summary 供生成屏展示(竞品步吐竞品名)。
    const collectionTasks = [
      runCollectionStep(reportId, 1, buildMarketSizePrompt(ctx), MarketSizeResult, collect,
        (d) => (d.tam && d.tam.value ? `TAM ≈ ${d.tam.value} ${d.tam.unit}` : undefined)),
      runCollectionStep(reportId, 2, buildCompetitorPrompt(ctx), CompetitorResult, collect,
        (d) => (d.competitors && d.competitors.length ? d.competitors.map((c) => c.name).join(' · ') : undefined)),
      runCollectionStep(reportId, 3, buildUserProfilePrompt(ctx), UserProfileResult, collect,
        (d) => (d.segments && d.segments.length ? `${d.segments.length} segments · ${d.painPoints.length} pain points` : undefined)),
      runCollectionStep(reportId, 4, buildTrendPrompt(ctx), TrendResult, collect,
        (d) => (d.direction ? `Trend: ${d.direction}` : undefined)),
    ];
    if (isHardware) {
      collectionTasks.push(runCollectionStep(reportId, 5, buildScenarioMapPrompt(ctx), ScenarioMapResult, collect,
        (d) => (d.scenarios && d.scenarios.length ? `${d.scenarios.length} use-case scenarios` : undefined)));
    }
    const [marketSize, competitors, userProfile, trend, scenarioMapRaw] = await Promise.all(collectionTasks);

    const collected = {
      marketSize: marketSize ?? undefined,
      competitors: competitors ?? undefined,
      userProfile: userProfile ?? undefined,
      trend: trend ?? undefined,
      scenarioMap: scenarioMapRaw ?? undefined,
    };

    // 推理阶段串行(消费上文,含场景图缺口 → 差异化切口)
    const barrier = await runAnalysisStep(reportId, barrierStep, buildBarrierPrompt(ctx, collected), BarrierResult, reason);
    const conclusionDraft = await runAnalysisStep(reportId, conclusionStep, buildConclusionPrompt(ctx, collected), ConclusionDraft, reason);

    // 聚合 + 落库
    const conclusion = enrichConclusion(conclusionDraft ?? undefined);
    const mkt = gate(marketSize, (m) => !m.tam?.value);
    const cmp = gate(competitors, (m) => m.competitors.length === 0);
    const usr = gate(userProfile, (m) => m.segments.length === 0 && m.painPoints.length === 0);
    const trd = gate(trend, (m) => m.keywords.length === 0);
    const scn = isHardware ? gate(scenarioMapRaw, (m) => m.scenarios.length === 0) : undefined;
    const collectedModules = isHardware ? [mkt, cmp, usr, trd, scn] : [mkt, cmp, usr, trd];
    const meta = {
      dataCollectedAt: new Date().toISOString(),
      methodologyVersion: METHODOLOGY_VERSION,
      overallConfidence: deriveConfidence(collectedModules),
      template,
      plan,
      sourcedModuleCount: collectedModules.filter((m) => m?.citations?.length).length,
      moduleCount: collectedModules.length,
      rerunOf: rerunOf ?? null,
    };
    const report = ResearchReport.parse({
      productName, coreQuestion, industry,
      marketSize: mkt, competitors: cmp, userProfile: usr, trend: trd,
      scenarioMap: scn, barrier, conclusion, meta,
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
