"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { ChatSession } from "@/lib/chatHistory";

type ChatSidebarProps = {
  open: boolean;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ChatSidebar({
  open,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onClose,
}: ChatSidebarProps) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[2px] md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: open ? "var(--chat-sidebar-width)" : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="relative z-40 flex h-full shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-card/95 backdrop-blur-md"
      >
        <div className="flex w-[var(--chat-sidebar-width)] flex-col h-full">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-4">
            <h2 className="text-sm font-bold tracking-tight text-text-main">Chats</h2>
            <button
              type="button"
              onClick={onNewChat}
              className="neo-button !rounded-lg !px-3 !py-1.5 !text-xs"
            >
              + New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {sorted.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-text-muted">No conversations yet</p>
            ) : (
              <ul className="space-y-1">
                {sorted.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className={`w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                          isActive
                            ? "bg-accent-blue text-text-main shadow-sm"
                            : "text-text-muted hover:bg-muted hover:text-text-main"
                        }`}
                      >
                        <div className="truncate text-[13px] font-medium">{session.title}</div>
                        <div className="mt-0.5 text-[11px] opacity-70">{formatRelativeTime(session.updatedAt)}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}
