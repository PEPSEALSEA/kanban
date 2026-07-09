import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import {
  buildFallbackAnswerFromRows,
  isGeminiLocationRestrictionError,
  isGeminiQuotaError,
  loadRagContext,
  resolveGeminiModel,
} from './ragContext';
import { logAiChat, type SheetBindings } from './sheets';

type ChatBindings = SheetBindings & {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
};

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim();
    if (text) return text;
  }
  return '';
}

function logChat(
  env: SheetBindings,
  payload: {
    email: string;
    userName?: string;
    userMessage: string;
    model: string;
    status: 'success' | 'fallback' | 'error';
    contextSummary: { totalRows: number; totalSubjects: number; totalDates: number };
    aiAnswer?: string;
    errorMessage?: string;
  }
) {
  logAiChat(env, {
    email: payload.email,
    userName: payload.userName,
    userMessage: payload.userMessage,
    aiAnswer: payload.aiAnswer,
    model: payload.model,
    status: payload.status,
    contextTotalRows: payload.contextSummary.totalRows,
    contextSubjects: payload.contextSummary.totalSubjects,
    contextDates: payload.contextSummary.totalDates,
    errorMessage: payload.errorMessage,
  }).catch((logErr) => console.warn('logAiChat failed', logErr));
}

function createFallbackStreamResponse(fallbackText: string, messages: UIMessage[]) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: ({ writer }) => {
        writer.write({ type: 'text-start', id: 'fallback-text' });
        writer.write({ type: 'text-delta', id: 'fallback-text', delta: fallbackText });
        writer.write({ type: 'text-end', id: 'fallback-text' });
      },
    }),
  });
}

export async function handleAiChatRequest(
  env: ChatBindings,
  authUser: { email: string; name?: string },
  body: { messages?: UIMessage[] }
): Promise<Response> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const userMessage = extractLastUserText(messages);
  const modelUsed = resolveGeminiModel(undefined, env);
  const emptyContext = { totalRows: 0, totalSubjects: 0, totalDates: 0 };

  let contextSummary = emptyContext;
  let contextRows: Awaited<ReturnType<typeof loadRagContext>>['contextRows'] = [];
  let systemInstruction = '';

  try {
    const rag = await loadRagContext(env, authUser.email, userMessage);
    contextRows = rag.contextRows;
    systemInstruction = rag.systemInstruction;
    contextSummary = rag.contextSummary;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load Google Sheet data';
    logChat(env, {
      email: authUser.email,
      userName: authUser.name,
      userMessage: userMessage || '(empty)',
      model: modelUsed,
      status: 'error',
      contextSummary: emptyContext,
      errorMessage: message,
    });
    return Response.json({ error: `Google Sheet error: ${message}` }, { status: 500 });
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const recentMessages = messages.slice(-8);

  try {
    const result = streamText({
      model: google(modelUsed),
      system: systemInstruction,
      messages: await convertToModelMessages(recentMessages),
      temperature: 0.2,
      maxRetries: 0,
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Gemini chat failed';
          if (isGeminiLocationRestrictionError(error)) {
            return buildFallbackAnswerFromRows(contextRows, userMessage || 'สรุปข้อมูล');
          }
          if (isGeminiQuotaError(error)) {
            return 'ขออภัย ใช้งาน Gemini เกินโควต้าชั่วคราว กรุณารอประมาณ 1 นาทีแล้วลองใหม่';
          }
          logChat(env, {
            email: authUser.email,
            userName: authUser.name,
            userMessage: userMessage || '(empty)',
            model: modelUsed,
            status: 'error',
            contextSummary,
            errorMessage: message,
          });
          return message;
        },
        onFinish: ({ responseMessage }) => {
          const answer = responseMessage.parts
            .filter((part) => part.type === 'text')
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join('')
            .trim();
          logChat(env, {
            email: authUser.email,
            userName: authUser.name,
            userMessage: userMessage || '(empty)',
            model: modelUsed,
            status: 'success',
            contextSummary,
            aiAnswer: answer,
          });
        },
      }),
    });
  } catch (err) {
    if (isGeminiLocationRestrictionError(err)) {
      const fallback = buildFallbackAnswerFromRows(contextRows, userMessage || 'สรุปข้อมูล');
      logChat(env, {
        email: authUser.email,
        userName: authUser.name,
        userMessage: userMessage || '(empty)',
        model: modelUsed,
        status: 'fallback',
        contextSummary,
        aiAnswer: fallback,
      });
      return createFallbackStreamResponse(fallback, messages);
    }

    const message = err instanceof Error ? err.message : 'Gemini chat failed';
    logChat(env, {
      email: authUser.email,
      userName: authUser.name,
      userMessage: userMessage || '(empty)',
      model: modelUsed,
      status: 'error',
      contextSummary,
      errorMessage: message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
