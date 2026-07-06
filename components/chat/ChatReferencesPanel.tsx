"use client";

import { useState } from "react";
import type { GeminiChatReference } from "@/lib/geminiChat";

type ChatReferencesPanelProps = {
  references: GeminiChatReference[];
  variant?: "classic" | "experimental";
};

function clampText(value: string, maxLen: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

export default function ChatReferencesPanel({
  references,
  variant = "classic",
}: ChatReferencesPanelProps) {
  const [open, setOpen] = useState(false);
  const isExperimental = variant === "experimental";

  if (!references.length) return null;

  const panelClass = isExperimental
    ? "mt-3 overflow-hidden rounded-lg border border-[var(--exp-border)] bg-[var(--exp-bg)]"
    : "mt-3 overflow-hidden rounded-lg border border-slate-300 bg-white/90";

  const toggleClass = isExperimental
    ? "flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-[var(--exp-surface)]"
    : "flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-50";

  const itemClass = isExperimental
    ? "border-t border-[var(--exp-border)] px-3 py-2.5 text-[11px] leading-relaxed text-slate-700"
    : "border-t border-slate-200 px-3 py-2.5 text-[11px] leading-relaxed text-slate-700";

  return (
    <div className={panelClass}>
      <button type="button" className={toggleClass} onClick={() => setOpen((v) => !v)}>
        <span>Sources · {references.length}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div>
          {references.map((ref) => (
            <div key={ref.refId} className={itemClass}>
              <div className="mb-1 font-semibold text-slate-800">
                [{ref.refId}] {ref.subject} · {ref.date}
                <span className="ml-1 font-normal text-slate-500">
                  ({ref.rowType === "content" ? "เนื้อหาคาบเรียน" : "การบ้าน"})
                </span>
              </div>
              <div className="mb-1 font-medium text-slate-800">{ref.title}</div>
              {ref.snippet && <p className="mb-2 text-slate-600">{clampText(ref.snippet, 220)}</p>}
              <div className="flex flex-wrap gap-2">
                {ref.archiveUrl && (
                  <a
                    href={ref.archiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-sky-50 px-2 py-1 text-sky-700 underline"
                  >
                    เปิดใน Archive
                  </a>
                )}
                {(ref.sourceLinks || [])
                  .filter((link) => link !== ref.archiveUrl)
                  .slice(0, 4)
                  .map((link) => (
                    <a
                      key={`${ref.refId}-${link}`}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all rounded bg-slate-50 px-2 py-1 text-sky-700 underline"
                    >
                      {clampText(link, 80)}
                    </a>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
