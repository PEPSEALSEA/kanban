"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import ChatReferencesPanel from "@/components/chat/ChatReferencesPanel";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import AttachmentFileInput from "@/components/AttachmentFileInput";
import { useData } from "@/components/DataProvider";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";
import { completeGoogleLogin } from "@/lib/googleLogin";
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODELS,
  getStoredGeminiModel,
  prepareAttachment,
  sendGeminiChat,
  setStoredGeminiModel,
  type ChatAttachment,
  type ChatMessage,
  type GeminiChatReference,
  type GeminiContextSummary,
  type GeminiModelId,
} from "@/lib/geminiChat";

const ACCEPTED_TYPES = ["application/pdf"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type AssistantMessage = ChatMessage & {
  references?: GeminiChatReference[];
  contextSummary?: GeminiContextSummary;
};

export default function ChatPanel() {
  const { user, setUser, refreshData } = useData();
  const { isMobile } = useDeviceDetection();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [model, setModel] = useState<GeminiModelId>(DEFAULT_GEMINI_MODEL);
  const fileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModel(getStoredGeminiModel());
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const canSend = useMemo(() => {
    return !loading && (input.trim().length > 0 || Boolean(attachment));
  }, [loading, input, attachment]);

  const onModelChange = (value: string) => {
    const next = value as GeminiModelId;
    setModel(next);
    setStoredGeminiModel(next);
  };

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
    if (!user) return;
    const message = input.trim();
    if (!message && !attachment) return;
    setLoading(true);
    setError("");

    const nextMessages: AssistantMessage[] = message
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
        model,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer,
          references: res.references || [],
          contextSummary: res.contextSummary,
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

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-4xl flex-col px-4 pb-4 pt-2">
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-black bg-white p-8 text-center shadow-[8px_8px_0px_0px_#000]">
          <h2 className="mb-2 text-xl font-bold">AI Chat</h2>
          <p className="mb-6 max-w-md text-sm text-slate-600">
            เข้าสู่ระบบด้วย Google เพื่อค้นหาและสรุปเนื้อหาจากทุกวิชาและทุกคาบเรียน
          </p>
          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              if (!credentialResponse.credential) return;
              await completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
            }}
            onError={() => {}}
            size="large"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-4xl flex-col px-4 pb-4 pt-2">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">AI Chat</h1>
            <p className="text-xs text-slate-500">
              ค้นหาและสรุปเนื้อหาจากทุกวิชาและทุกคาบเรียน
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">โมเดล:</span>
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={loading}
              className="rounded-lg border-2 border-black bg-white px-2 py-1.5 text-sm outline-none"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {messages.length === 0 && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              ลองค้นหา เช่น <strong>กรีก โรมัน</strong> หรือ <strong>การบ้านวันนี้</strong>{" "}
              หรือแนบรูป/PDF เพื่อให้ช่วยวิเคราะห์
            </div>
          )}
          <div className="space-y-4">
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}`}
                className={`rounded-xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "ml-12 bg-sky-100 text-slate-900"
                    : "mr-12 bg-slate-100 text-slate-800"
                }`}
              >
                {m.role === "user" ? (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ) : (
                  <>
                    <MarkdownRenderer content={m.text} className="prose prose-sm max-w-none" />
                    {m.contextSummary && (
                      <p className="mt-2 text-[11px] text-slate-500">
                        {GEMINI_MODELS.find((item) => item.id === m.contextSummary?.modelUsed)?.label ||
                          m.contextSummary.modelUsed}
                        {" · "}
                        วิเคราะห์จาก {m.contextSummary.totalRows} แถว
                        {" · "}
                        {(m.references || []).length} แหล่งอ้างอิง
                      </p>
                    )}
                    <ChatReferencesPanel references={m.references || []} />
                  </>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-12 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                กำลังวิเคราะห์ข้อมูลทั้งหมดจากทุกวิชาและทุกคาบ...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t-2 border-black p-4">
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
                type="button"
              >
                ลบ
              </button>
            </div>
          )}
          {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
          <div className="flex gap-2">
            {isMobile ? (
              <AttachmentFileInput
                multiple={false}
                compact
                showCamera
                disabled={loading}
                buttonClassName="rounded-lg border-2 border-black px-2 py-2 text-xs hover:bg-slate-100 disabled:opacity-50"
                onChange={(e) => {
                  onPickFile(e.target.files?.[0]).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "อ่านไฟล์ไม่สำเร็จ")
                  );
                }}
              />
            ) : (
              <>
                <button
                  className="rounded-lg border-2 border-black px-3 py-2 text-sm hover:bg-slate-100"
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
              </>
            )}
            <input
              className="flex-1 rounded-lg border-2 border-black px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="พิมพ์หัวข้อหรือ keyword..."
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
              disabled={loading}
            />
            <button
              className="rounded-lg border-2 border-black bg-sky-400 px-4 py-2 text-sm font-bold text-black shadow-[2px_2px_0px_0px_#000] disabled:opacity-50"
              disabled={!canSend}
              onClick={() =>
                onSubmit().catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ")
                )
              }
              type="button"
            >
              {loading ? "..." : "ส่ง"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
