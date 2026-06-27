// AI 方案路由:按档位把「采集器 / 推理器」映射到具体模型。
// orchestrator 只依赖统一签名,不关心底层是哪家。
//   Collector: (prompt, schema) => Promise<{ data, citations }>
//   Reasoner:  (prompt, schema) => Promise<data>
const { callDeepSeekJson } = require('./deepseek');
const { callPerplexityJson } = require('./perplexity');
const { callClaudeJson } = require('./claude');

// DeepSeek 无联网,采集时 citations 恒为空。
const deepseekCollect = async (prompt, schema) => ({
  data: await callDeepSeekJson(prompt, schema),
  citations: [],
});

const PLANS = {
  economy: {
    label: '经济版 · 全 DeepSeek(无实时联网)',
    collect: deepseekCollect,
    reason: callDeepSeekJson,
  },
  balanced: {
    label: '均衡版 · Perplexity 采集 + DeepSeek 推理',
    collect: callPerplexityJson,
    reason: callDeepSeekJson,
  },
  premium: {
    label: '高级版 · Perplexity 采集 + Claude 推理',
    collect: callPerplexityJson,
    reason: callClaudeJson,
  },
};

module.exports = { PLANS };
