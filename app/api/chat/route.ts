import { google } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { chatTools } from '@/lib/chatTools';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: `You are a helpful study assistant for StudyFlow. When answering questions:
- First use analyzeContext to understand what the user needs
- Then use searchFile if file-specific context would help (pick a plausible filename like notes.txt or homework.pdf)
- Finally synthesize a clear, concise answer in the same language as the user`,
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
