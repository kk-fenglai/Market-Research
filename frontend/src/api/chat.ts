import { apiBaseUrl } from './baseUrl';
import { api, ACCESS_KEY, refreshAccessToken } from './client';

// Ask AI 流式对话客户端。用 fetch 直连 SSE(axios 不便处理流),手动解析 data 帧。
// 历史记录走普通 axios 通道(见文件末尾的 conversation CRUD)。

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatMessage {
  role: ChatRole;
  content: string;
  citations?: string[];
  provider?: string; // 实际作答引擎:'deepseek' | 'perplexity'
}

/** 历史列表项(不含消息正文)。 */
export interface ConversationListItem {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (info: { citations: string[]; provider: string }) => void;
  onError: (message: string) => void;
  /** 会话归属回执:新会话在此拿到 conversationId 与自动生成的标题。 */
  onMeta?: (info: { conversationId: string; title: string }) => void;
}

/**
 * 发起流式对话。逐段回调 onDelta,结束回调 onDone(带引用)。
 * 不传 conversationId = 开新会话,服务端会新建并经 onMeta 回传 id。
 * @returns 可调用以中止本次流。
 */
export function streamChat(
  messages: ChatMessage[],
  opts: { useSearch?: boolean; conversationId?: string | null; reportId?: string } & StreamHandlers
): () => void {
  const controller = new AbortController();
  const body = JSON.stringify({
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    useSearch: !!opts.useSearch,
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    ...(opts.reportId ? { reportId: opts.reportId } : {}),
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
          else if (event === 'meta') opts.onMeta?.({ conversationId: data.conversationId, title: data.title });
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

// ─────────────────────────  历史记录(会话 CRUD)  ─────────────────────────

/**
 * 历史会话列表,按最近活跃排序。
 * 传 reportId 只列该报告的问答;不传只列通用 Ask AI(两边互不混入)。
 */
export async function listConversations(reportId?: string): Promise<ConversationListItem[]> {
  const { data } = await api.get<{ conversations: ConversationListItem[] }>('/chat/conversations', {
    params: reportId ? { reportId } : undefined,
  });
  return data.conversations;
}

/** 拉取某会话的完整消息,用于恢复对话流。 */
export async function getConversation(id: string): Promise<{ id: string; title: string; messages: ChatMessage[] }> {
  const { data } = await api.get<{
    id: string;
    title: string;
    messages: { role: ChatRole; content: string; provider: string | null; citations: string[] | null }[];
  }>(`/chat/conversations/${id}`);
  return {
    id: data.id,
    title: data.title,
    messages: data.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.provider ? { provider: m.provider } : {}),
      ...(m.citations?.length ? { citations: m.citations } : {}),
    })),
  };
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await api.patch(`/chat/conversations/${id}`, { title });
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/chat/conversations/${id}`);
}
