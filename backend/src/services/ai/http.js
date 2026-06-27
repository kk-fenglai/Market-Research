// AI 调用共享传输层(超时 / 指数退避重试 / 错误日志)。
// 调研类调用均为只读、幂等,可安全重试。Node 18+ 全局 fetch。
const { logger } = require('../../utils/logger');

/** 5xx / 429 视为可重试;其余 4xx 直接抛出。 */
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 带超时 + 指数退避重试的 fetch。超时用 AbortController 实现。
 * @param {string} url
 * @param {object} init
 * @param {{label:string, timeoutMs?:number, retries?:number}} opts
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, init, { label, timeoutMs = 60000, retries = 2 }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (isRetryableStatus(res.status) && attempt < retries) {
        logger.warn({ label, status: res.status, attempt: attempt + 1 }, 'ai.fetch.retry');
        await sleep(500 * 2 ** attempt);
        continue;
      }
      const body = await res.text().catch(() => '');
      throw new Error(`[${label}] HTTP ${res.status}: ${body.slice(0, 300)}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isAbort = err && err.name === 'AbortError';
      if (attempt < retries) {
        logger.warn({ label, reason: isAbort ? 'timeout' : 'network', attempt: attempt + 1 }, 'ai.fetch.retry');
        await sleep(500 * 2 ** attempt);
        continue;
      }
      logger.error({ label, err: err && err.message }, 'ai.fetch.fail');
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`[${label}] unknown error`);
}

module.exports = { fetchWithRetry };
