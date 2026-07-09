import type { UIMessage } from 'ai';

export type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
};

const STORAGE_KEY = 'studyflow-ai-chat-sessions';

export function loadChatSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChatSessions(sessions: ChatSession[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function createSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveSessionTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';

  const textPart = firstUser.parts.find((p) => p.type === 'text');
  if (textPart && textPart.type === 'text') {
    const text = textPart.text.trim();
    if (text) return text.length > 40 ? `${text.slice(0, 37)}...` : text;
  }

  return 'New chat';
}
