// 市场调研业务路由。全部经 requireAuth(挂载处统一加),并按 userId 做数据隔离。
const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { logger } = require('../utils/logger');
const { ResearchInput, CostInputs, ResearchPlan } = require('../services/research/schemas');
const { runResearch } = require('../services/research/orchestrator');
const { reportToMarkdown } = require('../services/research/markdown');
const { ResearchReport } = require('../services/research/schemas');
const { REVISABLE, SECTION_KEYS, reviseSection } = require('../services/research/revise');

const router = express.Router();

// 归属校验小工具:返回该用户的报告或 null。
async function findOwned(reportId, userId, select) {
  return prisma.researchReport.findFirst({ where: { id: reportId, userId }, select });
}

// GET /api/research — 当前用户的报告(工程)列表
router.get('/', async (req, res, next) => {
  try {
    const reports = await prisma.researchReport.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, productName: true, status: true, score: true, createdAt: true },
    });
    res.json({ reports });
  } catch (e) { next(e); }
});

// POST /api/research/start — 落库(pending)→ fire-and-forget 跑流水线 → 返回 reportId
router.post('/start', async (req, res, next) => {
  const parsed = ResearchInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '输入不合法', detail: parsed.error.flatten() });
  }
  const { productName, coreQuestion, industry, plan, template, rerunOf } = parsed.data;
  try {
    const report = await prisma.researchReport.create({
      data: {
        userId: req.userId,
        productName,
        coreQuestion: coreQuestion ?? null,
        industry: industry ?? null,
        status: 'pending',
      },
      select: { id: true },
    });
    // 进程内异步执行,不阻塞响应;orchestrator 内部已捕获所有错误。
    runResearch(report.id, { productName, coreQuestion, industry, plan, template, rerunOf: rerunOf ?? null })
      .catch((err) => logger.error({ err: err && err.message, reportId: report.id }, 'research.kick.fail'));
    res.status(201).json({ reportId: report.id });
  } catch (e) { next(e); }
});

// GET /api/research/:id/status — 报告状态 + 6 步进度(前端 2s 轮询)
router.get('/:id/status', async (req, res, next) => {
  try {
    const report = await findOwned(req.params.id, req.userId, { id: true, status: true, score: true });
    if (!report) return res.status(404).json({ error: '未找到报告' });
    const steps = await prisma.researchStep.findMany({
      where: { reportId: req.params.id },
      orderBy: { stepNumber: 'asc' },
      select: { stepNumber: true, stepName: true, status: true, summary: true, error: true },
    });
    res.json({ reportId: report.id, status: report.status, score: report.score, steps });
  } catch (e) { next(e); }
});

// GET /api/research/:id/result — 完整报告 + 成本输入
router.get('/:id/result', async (req, res, next) => {
  try {
    const report = await findOwned(req.params.id, req.userId, {
      id: true, status: true, score: true, result: true, costInputs: true,
    });
    if (!report) return res.status(404).json({ error: '未找到报告' });
    res.json({
      reportId: report.id,
      status: report.status,
      score: report.score,
      result: report.result,
      costInputs: report.costInputs ?? null,
    });
  } catch (e) { next(e); }
});

// PATCH /api/research/:id — 保存用户手动录入的成本/定价
router.patch('/:id', async (req, res, next) => {
  const parsed = CostInputs.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '输入不合法' });
  try {
    const updated = await prisma.researchReport.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { costInputs: parsed.data },
    });
    if (updated.count === 0) return res.status(404).json({ error: '未找到报告' });
    res.json({ saved: req.params.id, costInputs: parsed.data });
  } catch (e) { next(e); }
});

// GET /api/research/:id/export?format=md — 导出 Markdown
router.get('/:id/export', async (req, res, next) => {
  if ((req.query.format || 'md') !== 'md') return res.status(400).json({ error: '暂只支持 md' });
  try {
    const report = await findOwned(req.params.id, req.userId, { result: true, status: true });
    if (!report || report.status !== 'completed' || !report.result) {
      return res.status(404).json({ error: '报告不存在或未完成' });
    }
    const md = reportToMarkdown(ResearchReport.parse(report.result));
    const filename = `market-research-${req.params.id.slice(0, 8)}.md`;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(md);
  } catch (e) { next(e); }
});

// ═══════════════════════  AI 改写(提案 → 应用 → 回滚)  ═══════════════════════
// 三段式:AI 生成的内容先落成 proposed 提案,用户在前端看过 diff 点「应用」才写回 result。
// 每次应用都留下 before,所以任何一次改写都可回滚。

const ReviseInput = z.object({
  section: z.enum(SECTION_KEYS),
  instruction: z.string().trim().min(1).max(1000),
  plan: ResearchPlan.optional(),
});

/** 取出该用户已完成的报告 + 解析后的 result;失败时 res 已被写好错误,返回 null。 */
async function loadCompletedReport(req, res) {
  const row = await findOwned(req.params.id, req.userId, { id: true, status: true, result: true });
  if (!row) { res.status(404).json({ error: '未找到报告' }); return null; }
  if (row.status !== 'completed' || !row.result) {
    res.status(409).json({ error: '报告未完成,暂不能改写' });
    return null;
  }
  return row;
}

// POST /api/research/:id/revise — 让 AI 生成某分区的改写提案(不写回报告)
router.post('/:id/revise', async (req, res, next) => {
  const parsed = ReviseInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '输入不合法', detail: parsed.error.flatten() });
  const { section, instruction, plan } = parsed.data;
  try {
    const row = await loadCompletedReport(req, res);
    if (!row) return;
    const report = row.result;
    const { before, after, label, warnings, restored, mode, added } =
      await reviseSection(report, section, instruction, plan ?? report?.meta?.plan);
    const revision = await prisma.reportRevision.create({
      data: { reportId: row.id, section, instruction, status: 'proposed', before: before ?? undefined, after },
      select: { id: true, createdAt: true },
    });
    res.status(201).json({
      revisionId: revision.id, section, label, instruction, before, after,
      warnings, restored, mode, added,
      createdAt: revision.createdAt,
    });
  } catch (e) {
    // 模型输出不合 schema / 上游超时:这是可预期的业务失败,给明确提示而非 500。
    logger.error({ err: e && e.message, reportId: req.params.id }, 'research.revise.fail');
    res.status(502).json({ error: 'AI 改写失败,请调整指令后重试' });
  }
});

// GET /api/research/:id/revisions — 改写历史
router.get('/:id/revisions', async (req, res, next) => {
  try {
    const owned = await findOwned(req.params.id, req.userId, { id: true });
    if (!owned) return res.status(404).json({ error: '未找到报告' });
    const revisions = await prisma.reportRevision.findMany({
      where: { reportId: owned.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, section: true, instruction: true, status: true, createdAt: true, appliedAt: true },
    });
    res.json({
      revisions: revisions.map((r) => ({ ...r, label: REVISABLE[r.section]?.label ?? r.section })),
    });
  } catch (e) { next(e); }
});

/** 把某分区写回 result;conclusion 分区同时刷新报告总分。value 为空表示删除该分区(回滚到原本没有的状态)。 */
async function writeSection(reportId, currentResult, section, value) {
  const next = { ...currentResult };
  if (value == null) delete next[section];
  else next[section] = value;
  const data = { result: next };
  if (section === 'conclusion' && typeof value?.score === 'number') data.score = Math.round(value.score);
  await prisma.researchReport.update({ where: { id: reportId }, data });
  return next;
}

// POST /api/research/:id/revisions/:revId/apply — 确认应用提案
router.post('/:id/revisions/:revId/apply', async (req, res, next) => {
  try {
    const row = await loadCompletedReport(req, res);
    if (!row) return;
    const rev = await prisma.reportRevision.findFirst({
      where: { id: req.params.revId, reportId: row.id },
    });
    if (!rev) return res.status(404).json({ error: '未找到改写提案' });
    if (rev.status === 'applied') return res.status(409).json({ error: '该提案已应用过' });

    // 以「应用当下」的实际内容作为 before 存档:中间可能已被别的改写动过,
    // 用创建提案时的旧快照回滚会覆盖掉那些改动。
    const beforeNow = row.result?.[rev.section] ?? null;
    const result = await writeSection(row.id, row.result, rev.section, rev.after);
    await prisma.reportRevision.update({
      where: { id: rev.id },
      data: { status: 'applied', appliedAt: new Date(), before: beforeNow ?? undefined },
    });
    res.json({ applied: rev.id, section: rev.section, result });
  } catch (e) { next(e); }
});

// POST /api/research/:id/revisions/:revId/rollback — 回滚一次已应用的改写
router.post('/:id/revisions/:revId/rollback', async (req, res, next) => {
  try {
    const row = await loadCompletedReport(req, res);
    if (!row) return;
    const rev = await prisma.reportRevision.findFirst({
      where: { id: req.params.revId, reportId: row.id },
    });
    if (!rev) return res.status(404).json({ error: '未找到改写记录' });
    if (rev.status !== 'applied') return res.status(409).json({ error: '该记录未处于已应用状态,无需回滚' });

    const result = await writeSection(row.id, row.result, rev.section, rev.before ?? null);
    await prisma.reportRevision.update({ where: { id: rev.id }, data: { status: 'rolled_back' } });
    res.json({ rolledBack: rev.id, section: rev.section, result });
  } catch (e) { next(e); }
});

// DELETE /api/research/:id/revisions/:revId — 放弃一条未应用的提案
router.delete('/:id/revisions/:revId', async (req, res, next) => {
  try {
    const owned = await findOwned(req.params.id, req.userId, { id: true });
    if (!owned) return res.status(404).json({ error: '未找到报告' });
    const deleted = await prisma.reportRevision.deleteMany({
      where: { id: req.params.revId, reportId: owned.id, status: 'proposed' },
    });
    if (deleted.count === 0) return res.status(404).json({ error: '未找到可放弃的提案' });
    res.json({ discarded: req.params.revId });
  } catch (e) { next(e); }
});

// DELETE /api/research/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await prisma.researchReport.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: '未找到报告' });
    res.json({ deleted: req.params.id });
  } catch (e) { next(e); }
});

module.exports = router;
