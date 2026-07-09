import { tool } from 'ai';
import { z } from 'zod';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const chatTools = {
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

export type ChatToolName = keyof typeof chatTools;

export const TOOL_LABELS: Record<ChatToolName, { running: string; done: string }> = {
  analyzeContext: {
    running: 'Analyzing context...',
    done: 'Context analyzed',
  },
  searchFile: {
    running: 'Searching file...',
    done: 'File search complete',
  },
};
