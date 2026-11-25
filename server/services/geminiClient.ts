import { GoogleGenAI } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;
let cachedKey: string | undefined;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export function formatGeminiError(err: any): { status: number; error: string } {
  const rawMessage = err?.message || String(err || 'Gemini API request failed');
  const statusFromErr = typeof err?.status === 'number' ? err.status : undefined;

  if (rawMessage.includes('RESOURCE_EXHAUSTED') || statusFromErr === 429) {
    return {
      status: 429,
      error:
        'Quota or rate limit reached (429 RESOURCE_EXHAUSTED). Paid models require a billing-enabled API key in Settings > Secrets.',
    };
  }

  if (rawMessage.includes('PERMISSION_DENIED') || statusFromErr === 403) {
    return {
      status: 403,
      error:
        'Permission denied (403). Please verify your GEMINI_API_KEY permissions or select a billing-enabled key in Settings > Secrets.',
    };
  }

  if (rawMessage.includes('API_KEY_INVALID') || statusFromErr === 400) {
    return {
      status: 400,
      error: `Invalid request or API key (400): ${rawMessage}`,
    };
  }

  if (rawMessage.includes('NOT_FOUND') || statusFromErr === 404) {
    return {
      status: 404,
      error: `Requested model or resource not found (404): ${rawMessage}`,
    };
  }

  return {
    status: statusFromErr && statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500,
    error: rawMessage,
  };
}
