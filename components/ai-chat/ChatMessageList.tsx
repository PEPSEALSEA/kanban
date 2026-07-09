"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import ChatMessage from "@/components/ai-chat/ChatMessage";
import ChatEmptyState from "@/components/ai-chat/ChatEmptyState";
import ThinkingSpinner from "@/components/ai-chat/ThinkingSpinner";

type ChatMessageListProps = {
  messages: UIMessage[];
  isStreaming: boolean;
};

export default function ChatMessageList({ messages, isStreaming }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isStreaming]);

  if (!messages.length && !isStreaming) {
    return <ChatEmptyState />;
  }

  const lastMessage = messages[messages.length - 1];
  const showThinking =
    isStreaming &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      (lastMessage.role === "assistant" &&
        !lastMessage.parts.some((p) => p.type === "text" && p.text.trim().length > 0)));

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto scroll-smooth px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-[var(--chat-max-width)] flex-col gap-6">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {showThinking && (
          <div className="flex items-center gap-2.5 text-sm text-text-muted">
            <ThinkingSpinner />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={bottomRef} className="h-px shrink-0 scroll-mt-4" />
      </div>
    </div>
  );
}
