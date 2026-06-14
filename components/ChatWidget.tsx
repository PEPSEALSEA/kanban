"use client";

import { useMemo, useRef, useState } from "react";
import { useData } from "@/components/DataProvider";
import {
  prepareAttachment,
  sendGeminiChat,
  type ChatMessage,
  type ChatAttachment,
  type GeminiContextRow,
  type GeminiFilterSummary,
} from "@/lib/geminiChat";

const ACCEPTED_TYPES = ["application/pdf"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export default function ChatWidget() {
  const { user } = useData();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    Array<ChatMessage & { contextRows?: GeminiContextRow[]; filterSummary?: GeminiFilterSummary }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = useMemo(() => {
    return !loading && (input.trim().length > 0 || Boolean(attachment));
  }, [loading, input, attachment]);

  if (!user) return null;

  const onPickFile = async (file?: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = ACCEPTED_TYPES.includes(file.type);
    if (!isImage && !isPdf) {
      setError("รองรับเฉพาะรูปภาพหรือ PDF");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("ไฟล์ต้องไม่เกิน 10MB");
      return;
    }
    setError("");
    const prepared = await prepareAttachment(file);
    setAttachment(prepared);
    setAttachmentName(file.name);
  };

  const onSubmit = async () => {
    const message = input.trim();
    if (!message && !attachment) return;
    setLoading(true);
    setError("");

    const nextMessages: Array<
      ChatMessage & { contextRows?: GeminiContextRow[]; filterSummary?: GeminiFilterSummary }
    > = message
      ? [...messages, { role: "user", text: message }]
      : messages;
    if (message) {
      setMessages(nextMessages);
    }
    setInput("");

    try {
      const res = await sendGeminiChat({
        message: message || "ช่วยวิเคราะห์ไฟล์ที่แนบ",
        history: messages.slice(-10).map((item) => ({
          role: item.role,
          text: item.text,
        })),
        user: {
          email: user.email,
          name: user.name,
        },
        attachment: attachment || undefined,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer,
          contextRows: res.contextRows || [],
          filterSummary: res.filterSummary,
        },
      ]);
      setAttachment(null);
      setAttachmentName("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-8 z-[21000] h-14 w-14 rounded-full border-2 border-black bg-sky-300 text-xl font-black text-black shadow-[4px_4px_0px_0px_#000]"
        aria-label="Open Gemini homework assistant"
      >
        AI
      </button>
      {open && (
        <div className="fixed bottom-40 right-8 z-[21000] w-[min(92vw,430px)] rounded-2xl border-2 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
          <div className="border-b-2 border-black px-4 py-3 font-bold">
            Gemini Homework Assistant
          </div>
          <div className="h-[420px] overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                ลองถามว่า &quot;การบ้านวันนี้มีอะไรบ้าง&quot; หรือแนบรูป/PDF เพื่อให้ช่วยวิเคราะห์
              </div>
            )}
            <div className="space-y-2">
              {messages.map((m, idx) => (
                <div
                  key={`${m.role}-${idx}`}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "ml-10 bg-sky-100 text-slate-900"
                      : "mr-10 bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.text}
                  {m.role === "assistant" && (m.contextRows || []).length > 0 && (
                    <div className="mt-2 rounded-md border border-slate-300 bg-white/80 p-2 text-[11px] leading-relaxed text-slate-700">
                      <div className="mb-1 font-semibold text-slate-800">
                        แหล่งอ้างอิงจากชีต
                      </div>
                      <div className="space-y-1">
                        {(m.contextRows || []).slice(0, 3).map((row, rowIndex) => (
                          <div key={`${idx}-${rowIndex}`} className="rounded bg-slate-50 px-2 py-1">
                            <div>
                              <span className="font-medium">วันที่:</span> {row.date || "-"} |{" "}
                              <span className="font-medium">วิชา:</span> {row.subject || "-"}
                            </div>
                            {row.homework && (
                              <div>
                                <span className="font-medium">การบ้าน:</span> {row.homework}
                              </div>
                            )}
                            {(row.homeworkDeadline || row.deadlineDate) && (
                              <div>
                                <span className="font-medium">กำหนดส่ง:</span>{" "}
                                {row.homeworkDeadline || row.deadlineDate}
                              </div>
                            )}
                            {row.content && (
                              <div>
                                <span className="font-medium">เนื้อหา:</span> {row.content}
                              </div>
                            )}
                            {row.emphasis && (
                              <div>
                                <span className="font-medium">ครูเน้น:</span> {row.emphasis}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {m.filterSummary && (
                        <div className="mt-2 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                          <div>matched: {m.filterSummary.matchedRowsCount}</div>
                          {m.filterSummary.subjectKeywords.length > 0 && (
                            <div>subjects: {m.filterSummary.subjectKeywords.join(", ")}</div>
                          )}
                          {m.filterSummary.dueDateTarget && (
                            <div>dueTarget: {m.filterSummary.dueDateTarget}</div>
                          )}
                          {m.filterSummary.dateRange && (
                            <div>
                              range: {m.filterSummary.dateRange.start} - {m.filterSummary.dateRange.end}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 p-3">
            {attachmentName && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-2 py-1 text-xs">
                <span className="truncate">{attachmentName}</span>
                <button
                  className="ml-2 rounded px-1 py-0.5 font-semibold hover:bg-slate-200"
                  onClick={() => {
                    setAttachment(null);
                    setAttachmentName("");
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  ลบ
                </button>
              </div>
            )}
            {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-slate-300 px-2 text-sm hover:bg-slate-100"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                ไฟล์
              </button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  onPickFile(e.target.files?.[0]).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ")
                  );
                }}
              />
              <input
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="พิมพ์คำถาม..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit().catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ")
                    );
                  }
                }}
              />
              <button
                className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!canSend}
                onClick={() =>
                  onSubmit().catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ")
                  )
                }
              >
                {loading ? "..." : "ส่ง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
