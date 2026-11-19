import crypto from 'node:crypto';
import {
  AiProvider,
  DEFAULT_PROVIDER_MODELS,
  GEMINI_TEXT_FALLBACK_MODELS,
  GROQ_FALLBACK_MODELS,
  OPENROUTER_FALLBACK_MODELS,
  TaskDifficulty,
  resolveAiRoute,
  sanitizeApiKey,
  validateKeyFormatHint,
} from '../lib/aiRouter';
import {
  formatGeminiError,
  getGeminiClient,
  isTransientGeminiError,
  withTransientRetry,
} from './geminiAudio';
import { recordAiRun } from './mcpDatabase';

export interface MultiAiResult {
  provider: AiProvider;
  model: string;
  difficulty: TaskDifficulty;
  reason: string;
  output: string;
  durationMs: number;
}

export interface ProviderReadinessInfo {
  configured: boolean;
  defaultModel: string;
  keyWarning?: string;
}

export interface ProviderLiveCheck {
  provider: AiProvider;
  configured: boolean;
  ok: boolean;
  model: string;
  durationMs: number;
  message: string;
}

class UpstreamHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'UpstreamHttpError';
    this.status = status;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getProviderReadiness(): Record<AiProvider, ProviderReadinessInfo> {
  const geminiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
  const groqKey = sanitizeApiKey(process.env.GROQ_API_KEY);
  const openRouterKey = sanitizeApiKey(process.env.OPENROUTER_API_KEY);

  const groqModel = sanitizeApiKey(process.env.GROQ_MODEL) || DEFAULT_PROVIDER_MODELS.groq;
  const openRouterEnvModel = sanitizeApiKey(process.env.OPENROUTER_MODEL);
  // Automatically upgrade retired anthropic/claude-sonnet-4 env config to anthropic/claude-sonnet-4.6
  const openRouterModel =
    !openRouterEnvModel || openRouterEnvModel === 'anthropic/claude-sonnet-4'
      ? DEFAULT_PROVIDER_MODELS.openrouter
      : openRouterEnvModel;

  const groqWarn = validateKeyFormatHint('groq', groqKey);
  const geminiWarn = validateKeyFormatHint('gemini', geminiKey);
  const openRouterWarn = validateKeyFormatHint('openrouter', openRouterKey);

  return {
    groq: {
      configured: groqKey.length > 0,
      defaultModel: groqModel,
      ...(groqWarn ? { keyWarning: groqWarn } : {}),
    },
    gemini: {
      configured: geminiKey.length > 0 && geminiKey !== 'MY_GEMINI_API_KEY',
      defaultModel: DEFAULT_PROVIDER_MODELS.gemini,
      ...(geminiWarn ? { keyWarning: geminiWarn } : {}),
    },
    openrouter: {
      configured: openRouterKey.length > 0,
      defaultModel: openRouterModel,
      ...(openRouterWarn ? { keyWarning: openRouterWarn } : {}),
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
  timeoutMs?: number;
}): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }
  messages.push({ role: 'user', content: options.prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 35_000);

  try {
    const res = await fetch(options.endpoint, {
      method: 'POST',
      signal: controller.signal,
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
      error?: { message?: string; code?: string | number };
    } | null;

    if (!res.ok) {
      const upstreamMsg = data?.error?.message || res.statusText || "Noma'lum xato";
      throw new UpstreamHttpError(
        res.status,
        `Upstream API xatosi (${res.status}): ${upstreamMsg}`
      );
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Model javob qaytarmadi (bo'sh natija).");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveOpenRouterFallbackModel(): Promise<string | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (json.data || []).map((m) => m.id || '').filter(Boolean);
    const preferred =
      ids.find((id) => /^anthropic\/claude-sonnet-(4\.6|5|4\.5)/.test(id)) ||
      ids.find((id) => id.endsWith(':free')) ||
      ids[0];
    return preferred || null;
  } catch {
    return null;
  }
}

async function executeGroqWithRetry(options: {
  primaryModel: string;
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
}): Promise<{ output: string; model: string }> {
  const key = sanitizeApiKey(process.env.GROQ_API_KEY);
  if (!key) {
    throw new Error(
      "GROQ_API_KEY serverda sozlanmagan. Oson vazifalarni Groq orqali bajarish uchun Render Environment bo'limida GROQ_API_KEY qo'shing."
    );
  }

  const keyHint = validateKeyFormatHint('groq', key);
  const candidates = Array.from(new Set([options.primaryModel, ...GROQ_FALLBACK_MODELS]));
  let lastError: unknown;

  for (const model of candidates) {
    try {
      const output = await withTransientRetry(
        () =>
          callOpenAiCompatibleProvider({
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
            apiKey: key,
            model,
            systemInstruction: options.systemInstruction,
            prompt: options.prompt,
            jsonMode: options.jsonMode,
            timeoutMs: options.timeoutMs,
          }),
        options.maxAttempts ?? 2,
        700
      );
      return { output, model };
    } catch (err) {
      lastError = err;
      if (err instanceof UpstreamHttpError && (err.status === 401 || err.status === 403)) {
        throw new Error(
          `Groq API kaliti rad etildi (${err.status} Invalid API Key). Render Environment bo'limida GROQ_API_KEY ni console.groq.com/keys dan olingan yangi kalit bilan yangilang (qo'shtirnoq va ortiqcha bo'shliqsiz).${
            keyHint ? ` ${keyHint}` : ''
          }`
        );
      }
      if (err instanceof UpstreamHttpError && err.status === 404) {
        continue; // try next fallback Groq model
      }
      throw err;
    }
  }
  throw lastError;
}

async function executeGeminiWithFallback(options: {
  primaryModel: string;
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  maxAttemptsPerModel?: number;
  timeoutMs?: number;
}): Promise<{ output: string; model: string }> {
  const ai = getGeminiClient();
  const candidates = Array.from(
    new Set([options.primaryModel, ...GEMINI_TEXT_FALLBACK_MODELS])
  );
  const timeoutMs = options.timeoutMs ?? 25_000;
  const maxAttempts = options.maxAttemptsPerModel ?? 2;
  let lastError: unknown;

  for (const model of candidates) {
    try {
      const response = await withTransientRetry(
        () =>
          withTimeout(
            ai.models.generateContent({
              model,
              contents: options.prompt,
              config: {
                ...(options.systemInstruction
                  ? { systemInstruction: options.systemInstruction }
                  : {}),
                ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
              },
            }),
            timeoutMs,
            `Gemini (${model})`
          ),
        maxAttempts,
        800
      );
      const output = (response.text || '').trim();
      if (!output) {
        throw new Error('Gemini API javob qaytarmadi.');
      }
      return { output, model };
    } catch (err) {
      lastError = err;
      if (isTransientGeminiError(err)) {
        // Try the next Gemini text model (e.g., gemini-3.1-flash-lite)
        continue;
      }
      throw new Error(formatGeminiError(err));
    }
  }
  throw new Error(formatGeminiError(lastError));
}

async function executeOpenRouterWithFallback(options: {
  primaryModel: string;
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  maxAttempts?: number;
  timeoutMs?: number;
}): Promise<{ output: string; model: string }> {
  const key = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY serverda sozlanmagan. Qiyin vazifalarni OpenRouter orqali bajarish uchun Render Environment bo'limida OPENROUTER_API_KEY qo'shing."
    );
  }

  const keyHint = validateKeyFormatHint('openrouter', key);
  const candidates = Array.from(
    new Set([options.primaryModel, ...OPENROUTER_FALLBACK_MODELS])
  );

  let lastError: unknown;
  for (const model of candidates) {
    try {
      const output = await withTransientRetry(
        () =>
          callOpenAiCompatibleProvider({
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey: key,
            model,
            systemInstruction: options.systemInstruction,
            prompt: options.prompt,
            jsonMode: options.jsonMode,
            timeoutMs: options.timeoutMs,
            extraHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'https://mcp-web-bridge.local',
              'X-Title': 'MCP Web Bridge',
            },
          }),
        options.maxAttempts ?? 2,
        800
      );
      return { output, model };
    } catch (err) {
      lastError = err;
      if (err instanceof UpstreamHttpError) {
        if (err.status === 401 || err.status === 403) {
          throw new Error(
            `OpenRouter API kaliti rad etildi (${err.status}). openrouter.ai/keys dan kalitni tekshiring.${
              keyHint ? ` ${keyHint}` : ''
            }`
          );
        }
        // Try next active fallback model on 404 (removed model), 402 (insufficient credits -> reaches :free), 400/503
        if ([400, 402, 404, 429, 502, 503].includes(err.status)) {
          continue;
        }
      }
      throw err;
    }
  }

  // Last-resort dynamic lookup from OpenRouter models catalog
  const liveModel = await fetchLiveOpenRouterFallbackModel();
  if (liveModel && !candidates.includes(liveModel)) {
    const output = await callOpenAiCompatibleProvider({
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: key,
      model: liveModel,
      systemInstruction: options.systemInstruction,
      prompt: options.prompt,
      jsonMode: options.jsonMode,
      timeoutMs: options.timeoutMs,
      extraHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'https://mcp-web-bridge.local',
        'X-Title': 'MCP Web Bridge',
      },
    });
    return { output, model: liveModel };
  }

  throw lastError;
}

async function runSingleProvider(
  provider: AiProvider,
  model: string,
  options: {
    prompt: string;
    systemInstruction?: string;
    jsonMode?: boolean;
    fastVerify?: boolean;
  }
): Promise<{ output: string; model: string }> {
  if (provider === 'groq') {
    return executeGroqWithRetry({
      primaryModel: model,
      prompt: options.prompt,
      systemInstruction: options.systemInstruction,
      jsonMode: options.jsonMode,
      maxAttempts: options.fastVerify ? 1 : 2,
      timeoutMs: options.fastVerify ? 10_000 : 35_000,
    });
  }
  if (provider === 'gemini') {
    return executeGeminiWithFallback({
      primaryModel: model,
      prompt: options.prompt,
      systemInstruction: options.systemInstruction,
      jsonMode: options.jsonMode,
      maxAttemptsPerModel: options.fastVerify ? 1 : 2,
      timeoutMs: options.fastVerify ? 10_000 : 25_000,
    });
  }
  return executeOpenRouterWithFallback({
    primaryModel: model,
    prompt: options.prompt,
    systemInstruction: options.systemInstruction,
    jsonMode: options.jsonMode,
    maxAttempts: options.fastVerify ? 1 : 2,
    timeoutMs: options.fastVerify ? 10_000 : 35_000,
  });
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

  const isAutoProvider = !options.provider || options.provider === 'auto';
  const attemptOrder: AiProvider[] = isAutoProvider
    ? [
        route.provider,
        ...(['gemini', 'openrouter', 'groq'] as AiProvider[]).filter(
          (p) => p !== route.provider && readiness[p].configured
        ),
      ]
    : [route.provider];

  const start = Date.now();
  let primaryError: unknown = null;

  for (let i = 0; i < attemptOrder.length; i++) {
    const currentProvider = attemptOrder[i];
    const requestedModel =
      currentProvider === route.provider
        ? route.model
        : readiness[currentProvider].defaultModel;

    try {
      const res = await runSingleProvider(currentProvider, requestedModel, {
        prompt: combinedPrompt,
        systemInstruction: options.systemInstruction,
        jsonMode: options.jsonMode,
      });

      const durationMs = Date.now() - start;
      const reason =
        i === 0
          ? res.model !== requestedModel
            ? `${route.reason} (Zaxira model: ${res.model})`
            : route.reason
          : `${route.provider} xatolik bergani sababli zaxira provayder (${currentProvider}/${res.model}) ga o'tkazildi.`;

      recordAiRun({
        id: crypto.randomUUID(),
        tier: route.difficulty,
        provider: currentProvider,
        model: res.model,
        prompt_preview: task,
        duration_ms: durationMs,
        status: 'ok',
      });

      return {
        provider: currentProvider,
        model: res.model,
        difficulty: route.difficulty,
        reason,
        output: res.output,
        durationMs,
      };
    } catch (err) {
      if (i === 0) {
        primaryError = err;
      }
      // Continue to fallback provider only if provider === 'auto'
    }
  }

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
  throw primaryError instanceof Error
    ? primaryError
    : new Error(String(primaryError || 'AI chaqiruvida xatolik'));
}

export async function verifyAllProviders(): Promise<ProviderLiveCheck[]> {
  const readiness = getProviderReadiness();
  const providers: AiProvider[] = ['groq', 'gemini', 'openrouter'];

  return Promise.all(
    providers.map(async (provider): Promise<ProviderLiveCheck> => {
      const info = readiness[provider];
      if (!info.configured) {
        return {
          provider,
          configured: false,
          ok: false,
          model: info.defaultModel,
          durationMs: 0,
          message: 'Server muhitida kalit kiritilmagan.',
        };
      }

      const start = Date.now();
      try {
        const res = await runSingleProvider(provider, info.defaultModel, {
          prompt: 'Reply with only: OK',
          fastVerify: true,
        });
        return {
          provider,
          configured: true,
          ok: true,
          model: res.model,
          durationMs: Date.now() - start,
          message: `Ishlayapti (${res.model})`,
        };
      } catch (err) {
        return {
          provider,
          configured: true,
          ok: false,
          model: info.defaultModel,
          durationMs: Date.now() - start,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );
}
