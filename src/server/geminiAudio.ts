import { GoogleGenAI } from '@google/genai';
import { sanitizeApiKey } from '../lib/aiRouter';

export type GeminiVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b503\b|\b429\b|\b502\b|\b504\b/i.test(msg) ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|try again later|ECONNRESET|ETIMEDOUT|fetch failed|timed out/i.test(
      msg
    )
  );
}

export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 900
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientGeminiError(err)) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; message?: string; status?: string };
    };
    if (parsed?.error?.message) {
      const code = parsed.error.code ? `${parsed.error.code} ` : '';
      const status = parsed.error.status ? ` (${parsed.error.status})` : '';
      return `Gemini API xatosi [${code.trim()}${status}]: ${parsed.error.message}`;
    }
  } catch {
    // not raw JSON
  }
  return raw;
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      "GEMINI_API_KEY server muhit o'zgaruvchilarida sozlanmagan. Iltimos, Secrets yoki Render Environment bo'limida GEMINI_API_KEY ni belgilang."
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateSpeechWav(options: {
  text: string;
  voiceName?: GeminiVoiceName;
  style?: string;
  expressive?: boolean;
}): Promise<{
  buffer: Buffer;
  mimeType: string;
  model: string;
  voiceName: GeminiVoiceName;
}> {
  const text = options.text.trim();
  if (!text) {
    throw new Error("TTS uchun matn bo'sh bo'lishi mumkin emas.");
  }

  const ai = getGeminiClient();
  const voiceName: GeminiVoiceName = options.voiceName || 'Kore';
  const model = options.expressive
    ? 'gemini-3.8-flash-tts'
    : 'gemini-3.8-flash-lite-tts';

  const part: {
    text: string;
    speechMetadata?: { style: string };
  } = { text };

  if (options.style && options.style.trim()) {
    part.speechMetadata = { style: options.style.trim() };
  }

  try {
    const response = await withTransientRetry(
      () =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [part],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        }),
      3,
      900
    );

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error('Gemini TTS audio qaytarmadi.');
    }

    return {
      buffer: Buffer.from(base64Audio, 'base64'),
      mimeType: 'audio/wav',
      model,
      voiceName,
    };
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}

export async function transcribeAudio(options: {
  base64Audio: string;
  mimeType: string;
  prompt?: string;
}): Promise<{
  transcript: string;
  model: string;
}> {
  if (!options.base64Audio.trim()) {
    throw new Error("STT uchun audio ma'lumoti bo'sh.");
  }

  const ai = getGeminiClient();
  const model = 'gemini-3.5-transcribe';
  const promptText =
    options.prompt?.trim() ||
    'Transcribe this audio accurately in its original language. Preserve punctuation.';

  try {
    const response = await withTransientRetry(
      () =>
        ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: options.mimeType || 'audio/wav',
                  data: options.base64Audio,
                },
              },
              { text: promptText },
            ],
          },
        }),
      3,
      900
    );

    const partsText = (response.candidates?.[0]?.content?.parts || [])
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
    const transcript = (response.text || partsText).trim();
    if (!transcript) {
      const finishReason = response.candidates?.[0]?.finishReason || 'unknown';
      if (finishReason === 'STOP') {
        return {
          transcript: "(Audioda aniq nutq aniqlanmadi yoki transkripsiya bo'sh qaytdi)",
          model,
        };
      }
      throw new Error(
        `Gemini STT transkripsiya matni qaytarmadi (finishReason: ${finishReason}).`
      );
    }

    return { transcript, model };
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }
}
