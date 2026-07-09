import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import type { Context } from 'hono';

type ChatBindings = {
  GEMINI_API_KEY?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const chatTools = {
  analyzeContext: tool({
    description:
      'Analyze the user message and conversation context to identify topics, intent, and key concepts.',
    inputSchema: z.object({
      query: z.string().describe('The user question or topic to analyze'),
    }),
    execute: async ({ query }) => {
      await delay(1800);
      return {
        summary: `Identified core topics around "${query.slice(0, 80)}"`,
        intent: 'information_request',
        keywords: query.split(/\s+/).filter(Boolean).slice(0, 6),
      };
    },
  }),
  searchFile: tool({
    description: 'Search project files for relevant context matching the query.',
    inputSchema: z.object({
      filename: z.string().describe('File name to search'),
      query: z.string().describe('Search terms'),
    }),
    execute: async ({ filename, query }) => {
      await delay(2200);
      return {
        filename,
        matches: [
          { line: 42, excerpt: `...${query} found in configuration...` },
          { line: 128, excerpt: `Related context for ${filename}` },
        ],
        totalMatches: 2,
      };
    },
  }),
};

const SYSTEM_PROMPT = `You are a helpful study assistant for StudyFlow. When answering questions:
- First use analyzeContext to understand what the user needs
- Then use searchFile if file-specific context would help (pick a plausible filename like notes.txt or homework.pdf)
- Finally synthesize a clear, concise answer in the same language as the user`;

export async function handleAiChatRequest(
  c: Context<{ Bindings: ChatBindings }>
): Promise<Response> {
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }

  const body = await c.req.json<{ messages?: UIMessage[] }>();
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: chatTools,
    stopWhen: isStepCount(5),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools: chatTools,
      originalMessages: messages,
    }),
  });
}
