"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useData } from "@/components/DataProvider";
import { authHeaders } from "@/lib/auth";
import { CHAT_API_PATH } from "@/lib/chatApi";
import {
  createSessionId,
  deriveSessionTitle,
  loadChatSessions,
  saveChatSessions,
  type ChatSession,
} from "@/lib/chatHistory";
import ChatSidebar from "@/components/ai-chat/ChatSidebar";
import ChatMessageList from "@/components/ai-chat/ChatMessageList";
import ChatComposer from "@/components/ai-chat/ChatComposer";

export default function AiChatPage() {
  const { user } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(() => createSessionId());
  const isHydrated = useRef(false);
  const skipNextPersist = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: CHAT_API_PATH,
        headers: () => authHeaders(),
      }),
    []
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({
    id: activeSessionId,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";
  const isReady = status === "ready";

  useEffect(() => {
    const stored = loadChatSessions();
    if (stored.length > 0) {
      setSessions(stored);
      setActiveSessionId(stored[0].id);
      skipNextPersist.current = true;
      setMessages(stored[0].messages);
    }
    isHydrated.current = true;
  }, [setMessages]);

  const persistSession = useCallback(
    (sessionId: string, sessionMessages: UIMessage[]) => {
      setSessions((prev) => {
        const title = deriveSessionTitle(sessionMessages);
        const existing = prev.find((s) => s.id === sessionId);
        const updated: ChatSession = {
          id: sessionId,
          title,
          updatedAt: Date.now(),
          messages: sessionMessages,
        };

        const next = existing
          ? prev.map((s) => (s.id === sessionId ? updated : s))
          : [updated, ...prev];

        saveChatSessions(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!isHydrated.current) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    if (!messages.length) return;
    persistSession(activeSessionId, messages);
  }, [messages, activeSessionId, persistSession]);

  const handleNewChat = () => {
    const id = createSessionId();
    setActiveSessionId(id);
    skipNextPersist.current = true;
    setMessages([]);
    setInput("");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSelectSession = (id: string) => {
    if (id === activeSessionId) {
      if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
      return;
    }

    const session = sessions.find((s) => s.id === id);
    setActiveSessionId(id);
    skipNextPersist.current = true;
    setMessages(session?.messages ?? []);
    setInput("");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || !isReady) return;
    sendMessage({ text });
    setInput("");
  };

  if (!user) {
    return (
      <div className="ai-chat mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-lg flex-col items-center justify-center px-4 py-8">
        <div className="neo-card w-full p-8 text-center">
          <h2 className="mb-2 text-xl font-bold text-text-main">AI Chat</h2>
          <p className="mb-6 text-sm text-text-muted">
            Sign in with Google using the button in the top navigation bar to start a conversation with StudyFlow AI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat flex h-[calc(100vh-5rem)] w-full overflow-hidden bg-canvas">
      <ChatSidebar
        open={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border-subtle bg-card/70 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="neo-button !rounded-lg !p-2"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold text-text-main">StudyFlow AI</h1>
            <p className="truncate text-xs text-text-muted">
              {isStreaming ? "Working on your request..." : "Ask anything about your studies"}
            </p>
          </div>
        </header>

        <ChatMessageList messages={messages} isStreaming={isStreaming} />

        {error && (
          <div className="mx-auto mb-2 max-w-[var(--chat-max-width)] px-4 text-xs text-red-600 md:px-8">
            {error.message}
          </div>
        )}

        <ChatComposer
          input={input}
          onInputChange={setInput}
          onSubmit={handleSend}
          disabled={!isReady}
        />
      </div>
    </div>
  );
}
