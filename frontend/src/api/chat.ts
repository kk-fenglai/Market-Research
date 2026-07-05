import { apiBaseUrl } from './baseUrl';
import { ACCESS_KEY, refreshAccessToken } from './client';

// Ask AI 流式对话客户端。用 fetch 直连 SSE(axios 不便处理流),手动解析 data 帧。

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  role: ChatRole;
  content: string;
  citations?: string[];
  provider?: string; // 实际作答引擎:'deepseek' | 'perplexity'
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (info: { citations: string[]; provider: string }) => void;
  onError: (message: string) => void;
}

/**
 * 发起流式对话。逐段回调 onDelta,结束回调 onDone(带引用)。
 * @returns 可调用以中止本次流。
 */
export function streamChat(
  messages: ChatMessage[],
  opts: { useSearch?: boolean } & StreamHandlers
): () => void {
  const controller = new AbortController();
  const body = JSON.stringify({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    useSearch: !!opts.useSearch,
  });

  const doFetch = (token: string | null) =>
    fetch(`${apiBaseUrl()}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: controller.signal,
    });

  (async () => {
    try {
      let res = await doFetch(localStorage.getItem(ACCESS_KEY));
      // access token 过期 → 刷新一次再重试(与 axios 通道同一套 refresh 逻辑)。
      if (res.status === 401) {
        const fresh = await refreshAccessToken();
        if (!fresh) { opts.onError('登录已过期,请重新登录'); return; }
        res = await doFetch(fresh);
      }
      if (!res.ok || !res.body) {
        opts.onError(res.status === 401 ? '登录已过期,请重新登录' : `请求失败 (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = 'message';
          let dataLine = '';
          for (const raw of frame.split('\n')) {
            if (raw.startsWith('event:')) event = raw.slice(6).trim();
            else if (raw.startsWith('data:')) dataLine = raw.slice(5).trim();
          }
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);
          if (event === 'done') opts.onDone({ citations: data.citations ?? [], provider: data.provider ?? '' });
          else if (event === 'error') opts.onError(data.error ?? '生成失败');
          else if (typeof data.delta === 'string') opts.onDelta(data.delta);
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // 用户主动停止
      opts.onError(err instanceof Error ? err.message : '网络错误');
    }
  })();

  return () => controller.abort();
}
