export type TaskDifficulty = 'easy' | 'medium' | 'hard';
export type AiProvider = 'groq' | 'gemini' | 'openrouter';

export interface RouteDecision {
  difficulty: TaskDifficulty;
  provider: AiProvider;
  model: string;
  reason: string;
}

export interface ProviderModels {
  groq: string;
  gemini: string;
  openrouter: string;
}

export const DEFAULT_PROVIDER_MODELS: ProviderModels = {
  groq: 'llama-3.1-8b-instant',
  gemini: 'gemini-4-hydrogen',
  openrouter: 'anthropic/claude-sonnet-4.6',
};

export const GROQ_FALLBACK_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
];

export const GEMINI_TEXT_FALLBACK_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
];

export const OPENROUTER_FALLBACK_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-sonnet-4.5',
  'deepseek/deepseek-r1-0528',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
];

export function sanitizeApiKey(raw?: string | null): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(cleaned)) {
    cleaned = cleaned.replace(/^bearer\s+/i, '').trim();
  }
  return cleaned;
}

export function validateKeyFormatHint(provider: AiProvider, key: string): string | null {
  if (!key) return null;
  if (provider === 'groq' && !key.startsWith('gsk_')) {
    return "GROQ_API_KEY odatda 'gsk_' bilan boshlanadi (console.groq.com/keys).";
  }
  if (provider === 'openrouter' && !key.startsWith('sk-or-')) {
    return "OPENROUTER_API_KEY odatda 'sk-or-' bilan boshlanadi (openrouter.ai/keys).";
  }
  if (provider === 'gemini' && key === 'MY_GEMINI_API_KEY') {
    return 'GEMINI_API_KEY hali haqiqiy kalit bilan almashtirilmagan.';
  }
  return null;
}

const HARD_KEYWORDS = [
  'architecture',
  'arxitektura',
  'refactor',
  'refaktoring',
  'security audit',
  'xavfsizlik auditi',
  'algorithm',
  'algoritm',
  'optimize',
  'optimallashtir',
  'debug',
  'proof',
  'isbot',
  'multi-step',
  'compare',
  'solishtir',
  'trade-off',
  'system design',
  'sql schema',
  'murakkab',
  'chuqur tahlil',
];

const MEDIUM_KEYWORDS = [
  'summarize',
  'xulosa',
  'analyze',
  'tahlil',
  'extract',
  'ajratib ol',
  'json',
  'draft',
  'maqola',
  'article',
  'report',
  'hisobot',
  'code review',
  'write a function',
  'funksiya yoz',
  'explain',
  'tushuntir',
];

export function classifyTaskDifficulty(task: string, contextLength = 0): TaskDifficulty {
  const lower = task.toLowerCase();
  const totalLen = task.length + contextLength;

  if (HARD_KEYWORDS.some((kw) => lower.includes(kw)) || totalLen > 4500) {
    return 'hard';
  }

  if (MEDIUM_KEYWORDS.some((kw) => lower.includes(kw)) || totalLen > 400) {
    return 'medium';
  }

  return 'easy';
}

export function resolveAiRoute(options: {
  task: string;
  difficulty?: 'auto' | TaskDifficulty;
  provider?: 'auto' | AiProvider;
  contextLength?: number;
  models?: Partial<ProviderModels>;
}): RouteDecision {
  const models: ProviderModels = {
    ...DEFAULT_PROVIDER_MODELS,
    ...(options.models || {}),
  };

  if (options.provider && options.provider !== 'auto') {
    const mapDiff: Record<AiProvider, TaskDifficulty> = {
      groq: 'easy',
      gemini: 'medium',
      openrouter: 'hard',
    };
    return {
      difficulty:
        options.difficulty && options.difficulty !== 'auto'
          ? options.difficulty
          : mapDiff[options.provider],
      provider: options.provider,
      model: models[options.provider],
      reason: `Foydalanuvchi/Claude tomonidan aniq ${options.provider} provayderi tanlandi.`,
    };
  }

  const difficulty: TaskDifficulty =
    options.difficulty && options.difficulty !== 'auto'
      ? options.difficulty
      : classifyTaskDifficulty(options.task, options.contextLength || 0);

  if (difficulty === 'easy') {
    return {
      difficulty,
      provider: 'groq',
      model: models.groq,
      reason: 'Oson / tezkor vazifa Groq API ga yo‘naltirildi.',
    };
  }

  if (difficulty === 'medium') {
    return {
      difficulty,
      provider: 'gemini',
      model: models.gemini,
      reason: 'O‘rtacha murakkablikdagi vazifa Gemini API ga yo‘naltirildi.',
    };
  }

  return {
    difficulty,
    provider: 'openrouter',
    model: models.openrouter,
    reason: 'Murakkab / chuqur tahlil vazifasi OpenRouter API ga yo‘naltirildi.',
  };
}
