"use client";

import { motion } from "framer-motion";
import type { UIMessage } from "ai";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ToolStepAccordion from "@/components/ai-chat/ToolStepAccordion";

type ChatMessageProps = {
  message: UIMessage;
};

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const textParts = message.parts.filter((p) => p.type === "text");
  const textContent = textParts.map((p) => (p.type === "text" ? p.text : "")).join("");

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-blue px-4 py-3 text-text-main shadow-sm">
          <p className="ai-chat-message-body whitespace-pre-wrap">{textContent}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex justify-start"
    >
      <div className="w-full max-w-full">
        <ToolStepAccordion parts={message.parts} />
        {textContent && (
          <div className="ai-chat-message-body rounded-2xl rounded-bl-md bg-card px-1 py-1 text-text-main">
            <MarkdownRenderer content={textContent} className="prose prose-sm max-w-none prose-slate" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
