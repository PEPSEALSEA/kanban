"use client";

import { type FormEvent, type KeyboardEvent } from "react";

type ChatComposerProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export default function ChatComposer({ input, onInputChange, onSubmit, disabled }: ChatComposerProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || disabled) return;
      onSubmit();
    }
  };

  return (
    <div className="border-t border-border-subtle bg-card/80 px-4 py-4 backdrop-blur-sm md:px-8">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[var(--chat-max-width)]">
        <div className="flex items-end gap-2 rounded-2xl border border-border-subtle bg-card p-2 shadow-sm transition-shadow focus-within:border-primary-hover focus-within:shadow-md">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Message StudyFlow AI..."
            className="ai-chat-composer max-h-32 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-text-main placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={disabled || !input.trim()}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-text-main transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          AI can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
