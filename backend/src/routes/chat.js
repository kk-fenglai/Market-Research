// Ask AI 对话路由。经 requireAuth(挂载处统一加)。
// POST /api/chat —— 以 SSE 向前端转发流式回答:
//   event 默认(data-only): { delta }         逐段文本
//   event: done            : { citations, provider }
//   event: error           : { error }
const express = require('express');
const { z } = require('zod');
const { logger } = require('../utils/logger');
const { streamChat } = require('../services/ai/chat');

const router = express.Router();

// 限制体量,防滥用:最多 20 轮上下文、单条 8k 字。
const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(20),
  useSearch: z.boolean().optional(),
});

router.post('/', async (req, res) => {
  const parsed = ChatInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '输入不合法', detail: parsed.error.flatten() });
  }
  const { messages, useSearch } = parsed.data;

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

  try {
    const { citations, provider } = await streamChat(
      { messages, useSearch, signal: controller.signal },
      (delta) => send(null, { delta })
    );
    send('done', { citations, provider });
  } catch (err) {
    if (controller.signal.aborted) return; // 客户端主动断开,不必回错误
    logger.error({ err: err && err.message }, 'chat.route.fail');
    send('error', { error: '生成失败,请重试' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

module.exports = router;
