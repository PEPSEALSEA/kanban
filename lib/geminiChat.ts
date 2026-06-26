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

export type GeminiChatRequest = {
  message: string;
  history: ChatMessage[];
  user: {
    email: string;
    name?: string;
  };
  attachment?: ChatAttachment;
};

export type GeminiChatResponse = {
  answer: string;
  sourceLinks?: string[];
  contextRows?: GeminiContextRow[];
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
