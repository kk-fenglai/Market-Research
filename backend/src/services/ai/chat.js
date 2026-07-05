// 对话(chat)流式适配器 —— 供 Perplexity 风格「Ask AI」入口使用。
// 与调研层的「单次 JSON」不同:这里要纯文本 + 流式(stream:true),逐 token 回调。
//   - 默认走 DeepSeek(deepseek-chat):便宜、无联网。
//   - useSearch 且配了 Perplexity key → sonar-pro:联网检索,返回 citations。
// 两家都是 OpenAI 兼容的 SSE(data: {...}\n\n / data: [DONE]),故解析逻辑共用。
const env = require('../../config/env');
const { logger } = require('../../utils/logger');

const DEEPSEEK_URL = `${env.DEEPSEEK_BASE_URL}/chat/completions`;
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

const SYSTEM_PROMPT =
  '你是 HardScout 的 AI 助手,面向硬件 maker 与中小硬件公司的立项决策。' +
  '回答简洁、结构化、可执行;涉及事实或数据时说明不确定性,不要编造具体规格或价格。';

/**
 * 流式对话。逐段回调 onDelta(text);结束返回 { citations, provider }。
 * @param {{messages:{role:string,content:string}[], useSearch?:boolean, signal?:AbortSignal}} opts
 * @param {(text:string)=>void} onDelta
 */
async function streamChat({ messages, useSearch = false, signal }, onDelta) {
  const canSearch = useSearch && !!env.PERPLEXITY_API_KEY;
  const provider = canSearch ? 'perplexity' : 'deepseek';
  if (provider === 'deepseek' && !env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY 未配置');

  const url = provider === 'perplexity' ? PERPLEXITY_URL : DEEPSEEK_URL;
  const apiKey = provider === 'perplexity' ? env.PERPLEXITY_API_KEY : env.DEEPSEEK_API_KEY;
  const model = provider === 'perplexity' ? 'sonar-pro' : 'deepseek-chat';

  // 首条注入 system(若调用方未带),其余原样透传。
  const full = messages[0]?.role === 'system' ? messages : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: full, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`[${provider}] HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let citations = [];

  // Node 18+ fetch: res.body 是 web ReadableStream,可 for await 逐块读取。
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    // 按 SSE 帧(以空行分隔)切分,保留最后不完整的一段。
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        // Perplexity 把 citations 放在流块顶层,取最后一次出现的。
        if (Array.isArray(json.citations) && json.citations.length) citations = json.citations;
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {
        // 半截 JSON / keep-alive 行,忽略。
      }
    }
  }
  logger.info({ provider, citations: citations.length }, 'chat.stream.done');
  return { citations, provider };
}

module.exports = { streamChat };
