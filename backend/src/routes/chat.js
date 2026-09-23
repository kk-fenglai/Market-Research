// Ask AI 对话路由。经 requireAuth(挂载处统一加),按 userId 做数据隔离。
//
// POST /api/chat —— 以 SSE 向前端转发流式回答,并把本轮问答落库:
//   event: meta            : { conversationId, title }   会话归属(新建会话时前端据此更新地址/列表)
//   event 默认(data-only): { delta }                    逐段文本
//   event: done            : { citations, provider }
//   event: error           : { error }
//
// 历史记录 CRUD:
//   GET    /api/chat/conversations      列表
//   GET    /api/chat/conversations/:id  某会话全部消息
//   PATCH  /api/chat/conversations/:id  重命名
//   DELETE /api/chat/conversations/:id  删除
const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { logger } = require('../utils/logger');
const { streamChat } = require('../services/ai/chat');
const { reportToMarkdown } = require('../services/research/markdown');

const router = express.Router();

const TITLE_MAX = 60;
// 报告上下文预算:超长会顶爆模型上下文,截断到此长度。
const REPORT_CONTEXT_MAX = 8000;

/** 报告问答的 system 提示:把整份报告渲染成 markdown 塞进去,要求只依据报告作答。 */
function buildReportSystemPrompt(result) {
  let md;
  try {
    md = reportToMarkdown(result);
  } catch {
    md = JSON.stringify(result);
  }
  if (md.length > REPORT_CONTEXT_MAX) md = `${md.slice(0, REPORT_CONTEXT_MAX)}\n…(报告过长,已截断)`;
  return [
    '你是 HardScout 的调研分析助手。用户正在查看下面这份已完成的市场调研报告,他的问题都是针对这份报告的。',
    '',
    '=== 报告全文 ===',
    md,
    '=== 报告结束 ===',
    '',
    '回答要求:',
    '1. 优先依据报告中的数据作答,并指出你引用的是报告哪个部分。',
    '2. 报告里没有的信息,明确说「报告未覆盖」,再给出你的判断并标注这是推断而非报告结论。',
    '3. 回答简洁、结构化、可执行,不要复述整份报告。',
  ].join('\n');
}

/** 用首条用户提问生成会话标题(截断,去换行)。 */
function titleFrom(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '新对话';
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX)}…` : clean;
}

/** 归属校验:返回该用户的会话或 null。 */
function findOwnedConversation(id, userId) {
  return prisma.chatConversation.findFirst({ where: { id, userId }, select: { id: true, title: true } });
}

// ─────────────────────────────  历史记录 CRUD  ─────────────────────────────

// GET /api/chat/conversations — 当前用户的会话列表(按最近活跃排序)
// ?reportId=xxx 只列该报告的问答;不带则只列通用 Ask AI(把报告问答挡在外面)。
router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await prisma.chatConversation.findMany({
      where: { userId: req.userId, reportId: req.query.reportId ? String(req.query.reportId) : null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    res.json({
      conversations: conversations.map(({ _count, ...c }) => ({ ...c, messageCount: _count.messages })),
    });
  } catch (e) { next(e); }
});

// GET /api/chat/conversations/:id — 某会话的完整消息
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const convo = await findOwnedConversation(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ error: '未找到会话' });
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, role: true, content: true, provider: true, citations: true, createdAt: true },
    });
    res.json({ id: convo.id, title: convo.title, messages });
  } catch (e) { next(e); }
});

// PATCH /api/chat/conversations/:id — 重命名
const RenameInput = z.object({ title: z.string().trim().min(1).max(TITLE_MAX) });
router.patch('/conversations/:id', async (req, res, next) => {
  const parsed = RenameInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: '标题不合法' });
  try {
    const convo = await findOwnedConversation(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ error: '未找到会话' });
    const updated = await prisma.chatConversation.update({
      where: { id: convo.id },
      data: { title: parsed.data.title },
      select: { id: true, title: true },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /api/chat/conversations/:id — 删除(消息随 onDelete: Cascade 一并删除)
router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const convo = await findOwnedConversation(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ error: '未找到会话' });
    await prisma.chatConversation.delete({ where: { id: convo.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─────────────────────────────  流式问答  ─────────────────────────────

// 限制体量,防滥用:最多 20 轮上下文、单条 8k 字。
const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(20),
  useSearch: z.boolean().optional(),
  conversationId: z.string().optional(), // 缺省 = 开新会话
  reportId: z.string().optional(),       // 传了 = 「报告问答」,把该报告作为上下文
});

router.post('/', async (req, res) => {
  const parsed = ChatInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '输入不合法', detail: parsed.error.flatten() });
  }
  const { messages, useSearch, conversationId, reportId } = parsed.data;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  // ── 报告问答:取出报告并压成 markdown 作为 system 上下文 ──
  let contextMessages = messages;
  if (reportId) {
    const row = await prisma.researchReport.findFirst({
      where: { id: reportId, userId: req.userId },
      select: { result: true, status: true },
    });
    if (!row) return res.status(404).json({ error: '未找到报告' });
    if (row.status !== 'completed' || !row.result) {
      return res.status(409).json({ error: '报告未完成,暂不能提问' });
    }
    contextMessages = [{ role: 'system', content: buildReportSystemPrompt(row.result) }, ...messages];
  }

  // ── 落库:定位/新建会话 + 写入用户提问(在开 SSE 之前,便于用普通 JSON 报错)──
  let convo = null;
  try {
    if (conversationId) {
      convo = await findOwnedConversation(conversationId, req.userId);
      if (!convo) return res.status(404).json({ error: '未找到会话' });
    } else {
      convo = await prisma.chatConversation.create({
        data: { userId: req.userId, title: titleFrom(lastUser?.content), reportId: reportId ?? null },
        select: { id: true, title: true },
      });
    }
    if (lastUser) {
      await prisma.chatMessage.create({
        data: { conversationId: convo.id, role: 'user', content: lastUser.content },
      });
    }
  } catch (err) {
    logger.error({ err: err && err.message }, 'chat.persist.user.fail');
    return res.status(500).json({ error: '会话保存失败,请重试' });
  }

  // SSE 头:关闭缓冲,保持长连接。
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  req.on('close', () => controller.abort()); // 客户端断开 → 取消上游请求

  const send = (event, data) => {
    if (res.writableEnded) return;
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 先告知会话归属:新建会话时前端据此挂上 conversationId 并刷新历史列表。
  send('meta', { conversationId: convo.id, title: convo.title });

  // 累积全文:正常结束或用户中途停止,都把已生成内容存下来。
  let answer = '';
  const saveAnswer = async (provider, citations) => {
    if (!answer.trim()) return;
    try {
      await prisma.chatMessage.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: answer,
          provider: provider || null,
          citations: citations && citations.length ? citations : undefined,
        },
      });
      // updatedAt 只在本行被 update 时刷新,这里显式触碰以驱动列表排序。
      await prisma.chatConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
    } catch (err) {
      logger.error({ err: err && err.message, conversationId: convo.id }, 'chat.persist.answer.fail');
    }
  };

  try {
    const { citations, provider } = await streamChat(
      { messages: contextMessages, useSearch, signal: controller.signal },
      (delta) => { answer += delta; send(null, { delta }); }
    );
    await saveAnswer(provider, citations);
    send('done', { citations, provider });
  } catch (err) {
    if (controller.signal.aborted) {
      await saveAnswer(null, []); // 用户中途停止:保留已生成的部分
      return;
    }
    logger.error({ err: err && err.message }, 'chat.route.fail');
    await saveAnswer(null, []);
    send('error', { error: '生成失败,请重试' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;
