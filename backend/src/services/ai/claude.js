// Claude adapter —— Step 5-6 的深度推理与结构化结论。
// system 指令强制 JSON + zod 校验 + 解析失败重试一次。
const env = require('../../config/env');
const { logger } = require('../../utils/logger');
const { fetchWithRetry } = require('./http');
const { extractJsonObject } = require('./json');

const JSON_SYSTEM = '你只能输出一个合法 JSON 对象,不得包含任何解释文字或 markdown 代码块。';

async function callClaudeRaw(prompt) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 未配置');
  const res = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: JSON_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    { label: 'claude', timeoutMs: 120000, retries: 2 }
  );
  const json = await res.json();
  return json.content?.[0]?.text ?? '';
}

/** @returns {Promise<T>} */
async function callClaudeJson(prompt, schema) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const content = await callClaudeRaw(prompt);
    try {
      return schema.parse(extractJsonObject(content));
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt, err: err && err.message }, 'claude.json.parse.fail');
    }
  }
  throw new Error(`Claude 结构化输出失败: ${String(lastErr)}`);
}

module.exports = { callClaudeJson };
