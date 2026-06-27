// 市场调研业务路由。全部经 requireAuth(挂载处统一加),并按 userId 做数据隔离。
const express = require('express');
const prisma = require('../prisma');
const { logger } = require('../utils/logger');
const { ResearchInput, CostInputs } = require('../services/research/schemas');
const { runResearch } = require('../services/research/orchestrator');
const { reportToMarkdown } = require('../services/research/markdown');
const { ResearchReport } = require('../services/research/schemas');

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

// DELETE /api/research/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await prisma.researchReport.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    if (deleted.count === 0) return res.status(404).json({ error: '未找到报告' });
    res.json({ deleted: req.params.id });
  } catch (e) { next(e); }
});

module.exports = router;
