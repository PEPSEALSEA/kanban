"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage, type UITools } from "ai";
import ThinkingSpinner from "@/components/ai-chat/ThinkingSpinner";
import { TOOL_LABELS, type ChatToolName } from "@/lib/chatTools";

type ToolPart = ToolUIPart<UITools> | DynamicToolUIPart;

function getToolLabel(part: ToolPart, running: boolean): string {
  const name = getToolName(part);
  const labels = TOOL_LABELS[name as ChatToolName];
  if (labels) return running ? labels.running : labels.done;

  if (name === "searchFile" && running) {
    const input = "input" in part ? (part.input as { filename?: string } | undefined) : undefined;
    if (input?.filename) return `Searching ${input.filename}...`;
    return "Searching file...";
  }

  return running ? `Running ${name}...` : `${name} complete`;
}

function formatToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function ToolStepItem({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "approval-responded";
  const isDone = part.state === "output-available";
  const isError = part.state === "output-error";

  const label = getToolLabel(part, isRunning);
  const canExpand = isDone || isError;

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-muted/60">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-card/80"
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
      >
        <AnimatePresence mode="wait">
          {isRunning ? (
            <motion.span
              key="spinner"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <ThinkingSpinner />
            </motion.span>
          ) : (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-bold ${
                isError ? "bg-red-100 text-red-600" : "bg-accent-blue text-sky-700"
              }`}
            >
              {isError ? "!" : "✓"}
            </motion.span>
          )}
        </AnimatePresence>

        <span className="flex-1 text-[13px] font-medium text-text-main">{label}</span>

        {canExpand && (
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-text-muted"
          >
            ▾
          </motion.span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && canExpand && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle px-3 py-2.5">
              {isError && "errorText" in part && (
                <p className="text-xs text-red-600">{part.errorText}</p>
              )}
              {isDone && "output" in part && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-card p-2.5 font-mono text-[11px] leading-relaxed text-text-muted">
                  {formatToolOutput(part.output)}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type ToolStepAccordionProps = {
  parts: UIMessage["parts"];
};

export default function ToolStepAccordion({ parts }: ToolStepAccordionProps) {
  const toolParts = parts.filter(isToolUIPart);
  if (!toolParts.length) return null;

  return (
    <div className="mb-3 space-y-2">
      {toolParts.map((part) => (
        <ToolStepItem key={part.toolCallId} part={part} />
      ))}
    </div>
  );
}
