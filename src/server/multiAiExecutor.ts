import crypto from 'node:crypto';
import {
  AiProvider,
  DEFAULT_PROVIDER_MODELS,
  TaskDifficulty,
  resolveAiRoute,
} from '../lib/aiRouter';
import { getGeminiClient } from './geminiAudio';
import { recordAiRun } from './mcpDatabase';

export interface MultiAiResult {
  provider: AiProvider;
  model: string;
  difficulty: TaskDifficulty;
  reason: string;
  output: string;
  durationMs: number;
}

export function getProviderReadiness(): Record<
  AiProvider,
  { configured: boolean; defaultModel: string }
> {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const openRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();

  return {
    groq: {
      configured: groqKey.length > 0,
      defaultModel: (process.env.GROQ_MODEL || DEFAULT_PROVIDER_MODELS.groq).trim(),
    },
    gemini: {
      configured: geminiKey.length > 0 && geminiKey !== 'MY_GEMINI_API_KEY',
      defaultModel: DEFAULT_PROVIDER_MODELS.gemini,
    },
    openrouter: {
      configured: openRouterKey.length > 0,
      defaultModel: (
        process.env.OPENROUTER_MODEL || DEFAULT_PROVIDER_MODELS.openrouter
      ).trim(),
    },
  };
}

async function callOpenAiCompatibleProvider(options: {
  endpoint: string;
  apiKey: string;
  model: string;
  systemInstruction?: string;
  prompt: string;
  jsonMode?: boolean;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }
  messages.push({ role: 'user', content: options.prompt });

  const res = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
      ...(options.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    throw new Error(
      `Upstream API xatosi (${res.status}): ${
        data?.error?.message || res.statusText || "Noma'lum xato"
      }`
    );
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Model javob qaytarmadi (bo'sh natija).");
  }
  return text;
}

export async function runMultiAiTask(options: {
  task: string;
  difficulty?: 'auto' | TaskDifficulty;
  provider?: 'auto' | AiProvider;
  context?: string;
  systemInstruction?: string;
  jsonMode?: boolean;
}): Promise<MultiAiResult> {
  const task = options.task.trim();
  if (!task) {
    throw new Error("Vazifa matni (task) bo'sh bo'lishi mumkin emas.");
  }

  const readiness = getProviderReadiness();
  const route = resolveAiRoute({
    task,
    difficulty: options.difficulty,
    provider: options.provider,
    contextLength: options.context ? options.context.length : 0,
    models: {
      groq: readiness.groq.defaultModel,
      gemini: readiness.gemini.defaultModel,
      openrouter: readiness.openrouter.defaultModel,
    },
  });

  const combinedPrompt = options.context?.trim()
    ? `${task}\n\n---\nKontekst:\n${options.context.trim()}`
    : task;

  const start = Date.now();
  try {
    let output = '';

    if (route.provider === 'groq') {
      const key = (process.env.GROQ_API_KEY || '').trim();
      if (!key) {
        throw new Error(
          "GROQ_API_KEY serverda sozlanmagan. Oson vazifalarni Groq orqali bajarish uchun Render/server muhitiga GROQ_API_KEY qo'shing."
        );
      }
      output = await callOpenAiCompatibleProvider({
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: key,
        model: route.model,
        systemInstruction: options.systemInstruction,
        prompt: combinedPrompt,
        jsonMode: options.jsonMode,
      });
    } else if (route.provider === 'gemini') {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: route.model,
        contents: combinedPrompt,
        config: {
          ...(options.systemInstruction
            ? { systemInstruction: options.systemInstruction }
            : {}),
          ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });
      output = (response.text || '').trim();
      if (!output) {
        throw new Error('Gemini API javob qaytarmadi.');
      }
    } else {
      const key = (process.env.OPENROUTER_API_KEY || '').trim();
      if (!key) {
        throw new Error(
          "OPENROUTER_API_KEY serverda sozlanmagan. Qiyin vazifalarni OpenRouter orqali bajarish uchun Render/server muhitiga OPENROUTER_API_KEY qo'shing."
        );
      }
      output = await callOpenAiCompatibleProvider({
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: key,
        model: route.model,
        systemInstruction: options.systemInstruction,
        prompt: combinedPrompt,
        jsonMode: options.jsonMode,
        extraHeaders: {
          'HTTP-Referer': process.env.APP_URL || 'https://mcp-web-bridge.local',
          'X-Title': 'MCP Web Bridge',
        },
      });
    }

    const durationMs = Date.now() - start;
    recordAiRun({
      id: crypto.randomUUID(),
      tier: route.difficulty,
      provider: route.provider,
      model: route.model,
      prompt_preview: task,
      duration_ms: durationMs,
      status: 'ok',
    });

    return {
      provider: route.provider,
      model: route.model,
      difficulty: route.difficulty,
      reason: route.reason,
      output,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    recordAiRun({
      id: crypto.randomUUID(),
      tier: route.difficulty,
      provider: route.provider,
      model: route.model,
      prompt_preview: task,
      duration_ms: durationMs,
      status: 'error',
    });
    throw err;
  }
}
