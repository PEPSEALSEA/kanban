import { API_URL } from "@/lib/config";
import { authHeaders } from "@/lib/auth";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export type ChatAttachment = {
  name: string;
  mimeType: string;
  dataBase64: string;
};

export const GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (แนะนำ)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];

export const DEFAULT_GEMINI_MODEL: GeminiModelId = "gemini-3.1-flash-lite";
export const GEMINI_MODEL_STORAGE_KEY = "studyflow_gemini_model";

export type GeminiChatRequest = {
  message: string;
  history: ChatMessage[];
  user: {
    email: string;
    name?: string;
  };
  attachment?: ChatAttachment;
  model?: string;
};

export type GeminiContextSummary = {
  totalRows: number;
  totalSubjects: number;
  totalDates: number;
  modelUsed: string;
  contextWarning?: string;
};

export type GeminiChatReference = {
  refId: number;
  date: string;
  subject: string;
  rowType: "content" | "homework";
  title: string;
  snippet: string;
  sourceLinks: string[];
  archiveUrl?: string;
};

export type AiChatLog = {
  id: string;
  email: string;
  user_name: string;
  user_message: string;
  ai_answer: string;
  model: string;
  attachment_name: string;
  status: "success" | "fallback" | "error" | string;
  context_total_rows: string;
  context_subjects: string;
  context_dates: string;
  references_json: string;
  source_links_json: string;
  error_message: string;
  created_at: string;
};

export type GeminiChatResponse = {
  answer: string;
  references?: GeminiChatReference[];
  sourceLinks?: string[];
  contextRows?: GeminiContextRow[];
  contextSummary?: GeminiContextSummary;
  filterSummary?: GeminiFilterSummary;
};

export type GeminiContextRow = {
  date: string;
  subject: string;
  homework: string;
  homeworkDeadline?: string;
  createdDate?: string;
  deadlineDate?: string;
  content: string;
  emphasis: string;
  sourceLinks?: string[];
};

export type GeminiFilterSummary = {
  subjectKeywords: string[];
  dateRange: { start: string; end: string } | null;
  dateTarget: "today" | "tomorrow" | null;
  dueDateTarget: "today" | "tomorrow" | null;
  wantsEmphasis: boolean;
  explicitWebSearch: boolean;
  matchedRowsCount: number;
  sourceDates: string[];
  sourceSubjects: string[];
};

export function getStoredGeminiModel(): GeminiModelId {
  if (typeof window === "undefined") return DEFAULT_GEMINI_MODEL;
  const stored = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
  if (stored && GEMINI_MODELS.some((m) => m.id === stored)) {
    return stored as GeminiModelId;
  }
  return DEFAULT_GEMINI_MODEL;
}

export function setStoredGeminiModel(model: GeminiModelId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const parts = result.split("base64,");
      resolve(parts[1] || "");
    };
    reader.onerror = () => reject(new Error("Failed to read attachment"));
    reader.readAsDataURL(file);
  });
}

export async function prepareAttachment(file: File): Promise<ChatAttachment> {
  const dataBase64 = await readFileAsBase64(file);
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataBase64,
  };
}

export async function sendGeminiChat(
  payload: GeminiChatRequest
): Promise<GeminiChatResponse> {
  const res = await fetch(`${API_URL}/api/gemini-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || "Gemini chat request failed");
  }

  return data.data as GeminiChatResponse;
}
