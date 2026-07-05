// DeepSeek adapter(OpenAI 兼容接口)。无联网搜索 → 采集步用它时无 citations。
// response_format json_object 强制 JSON;zod 校验 + 解析失败重试一次。
const env = require('../../config/env');
const { logger } = require('../../utils/logger');
const { fetchWithRetry } = require('./http');
const { extractJsonObject } = require('./json');

async function callDeepSeekRaw(prompt) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY 未配置');
  const res = await fetchWithRetry(
    `${env.DEEPSEEK_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    },
    { label: 'deepseek', timeoutMs: 120000, retries: 2 }
  );
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

/** @returns {Promise<T>} schema.parse 后的结果 */
async function callDeepSeekJson(prompt, schema) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = await callDeepSeekRaw(prompt);
    try {
      return schema.parse(extractJsonObject(content));
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt, err: err && err.message }, 'deepseek.json.parse.fail');
    }
  }
  throw new Error(`DeepSeek 结构化输出失败: ${String(lastErr)}`);
}

module.exports = { callDeepSeekJson };
