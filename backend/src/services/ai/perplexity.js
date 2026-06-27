// Perplexity adapter —— Step 1-4 的联网数据采集,返回正文 + 真实引用来源。
const env = require('../../config/env');
const { logger } = require('../../utils/logger');
const { fetchWithRetry } = require('./http');
const { extractJsonObject } = require('./json');

async function callPerplexityRaw(prompt) {
  if (!env.PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY 未配置');
  const res = await fetchWithRetry(
    'https://api.perplexity.ai/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'user', content: prompt }],
        return_citations: true,
      }),
    },
    { label: 'perplexity', timeoutMs: 60000, retries: 2 }
  );
  const json = await res.json();
  return {
    content: json.choices?.[0]?.message?.content ?? '',
    citations: json.citations ?? [],
  };
}

/** @returns {Promise<{data:T, citations:string[]}>} */
async function callPerplexityJson(prompt, schema) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { content, citations } = await callPerplexityRaw(prompt);
    try {
      const data = schema.parse(extractJsonObject(content));
      return { data, citations };
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt, err: err && err.message }, 'perplexity.json.parse.fail');
    }
  }
  throw new Error(`Perplexity 结构化输出失败: ${String(lastErr)}`);
}

module.exports = { callPerplexityJson };
