"use client";

import React, { useMemo, useState } from "react";
import type { AiChatLog, GeminiChatReference } from "@/lib/geminiChat";

function clampText(value: string, maxLen: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function parseReferences(raw: string): GeminiChatReference[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAiChatLogsPanel({ logs }: { logs: AiChatLog[] }) {
  const [emailFilter, setEmailFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = emailFilter.trim().toLowerCase();
    if (!q) return sortedLogs;
    return sortedLogs.filter((log) => String(log.email || "").toLowerCase().includes(q));
  }, [emailFilter, sortedLogs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">AI Chat Logs</h2>
          <p className="text-sm text-slate-500">
            ประวัติการใช้งาน AI Chat ทั้งหมด {filteredLogs.length} รายการ
          </p>
        </div>
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
          placeholder="ค้นหาตามอีเมล..."
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
        />
      </div>

      {filteredLogs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          ยังไม่มี log หรือไม่พบข้อมูลตามที่ค้นหา
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">เวลา</th>
                  <th className="px-4 py-3">อีเมล</th>
                  <th className="px-4 py-3">ข้อความ</th>
                  <th className="px-4 py-3">โมเดล</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const references = parseReferences(log.references_json);
                  const isOpen = expandedId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="border-t border-slate-200 align-top">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{log.email}</div>
                          {log.user_name && (
                            <div className="text-xs text-slate-500">{log.user_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="text-slate-800">{clampText(log.user_message, 120)}</div>
                          {log.attachment_name && (
                            <div className="mt-1 text-xs text-slate-500">ไฟล์: {log.attachment_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{log.model || "-"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              log.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : log.status === "fallback"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                            onClick={() => setExpandedId(isOpen ? null : log.id)}
                          >
                            {isOpen ? "ซ่อน" : "ดูรายละเอียด"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <h4 className="mb-2 font-semibold text-slate-800">คำตอบจาก AI</h4>
                                <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                  {log.ai_answer || "-"}
                                </div>
                              </div>
                              <div>
                                <h4 className="mb-2 font-semibold text-slate-800">Context and References</h4>
                                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                  <p>แถวทั้งหมด: {log.context_total_rows || "0"}</p>
                                  <p>วิชา: {log.context_subjects || "0"}</p>
                                  <p>วันที่: {log.context_dates || "0"}</p>
                                  <p className="mt-2 font-medium">แหล่งอ้างอิง ({references.length})</p>
                                  <div className="mt-2 space-y-2">
                                    {references.map((ref) => (
                                      <div key={ref.refId} className="rounded border border-slate-200 p-2 text-xs">
                                        <div className="font-semibold">
                                          [{ref.refId}] {ref.subject} · {ref.date}
                                        </div>
                                        <div>{ref.title}</div>
                                        <div className="text-slate-500">{clampText(ref.snippet, 160)}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {log.error_message && (
                              <p className="mt-3 text-sm text-red-600">Error: {log.error_message}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
