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
  openrouter: 'anthropic/claude-sonnet-4',
};

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
