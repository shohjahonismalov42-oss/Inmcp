import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROVIDER_MODELS,
  classifyTaskDifficulty,
  resolveAiRoute,
  sanitizeApiKey,
  validateKeyFormatHint,
} from './aiRouter';

test('classifyTaskDifficulty routes short simple tasks to easy, summaries to medium, and complex tasks to hard', () => {
  assert.equal(classifyTaskDifficulty('Salom, bugun havo qanday?'), 'easy');
  assert.equal(
    classifyTaskDifficulty('Quyidagi maqolani o‘zbek tilida qisqacha xulosa qilib ber'),
    'medium'
  );
  assert.equal(
    classifyTaskDifficulty('Design a distributed system architecture and security audit'),
    'hard'
  );
});

test('resolveAiRoute maps easy -> groq, medium -> gemini, hard -> openrouter with current active models', () => {
  const easy = resolveAiRoute({ task: 'Translate hello to Uzbek', difficulty: 'easy' });
  assert.equal(easy.provider, 'groq');
  assert.equal(easy.model, 'llama-3.1-8b-instant');

  const medium = resolveAiRoute({ task: 'Summarize this page', difficulty: 'medium' });
  assert.equal(medium.provider, 'gemini');
  assert.equal(medium.model, 'gemini-4-hydrogen');

  const hard = resolveAiRoute({ task: 'Complex refactor', difficulty: 'hard' });
  assert.equal(hard.provider, 'openrouter');
  assert.equal(hard.model, 'anthropic/claude-sonnet-4.6');
  assert.equal(DEFAULT_PROVIDER_MODELS.openrouter, 'anthropic/claude-sonnet-4.6');
});

test('resolveAiRoute respects explicit provider override', () => {
  const forced = resolveAiRoute({
    task: 'Simple question',
    provider: 'openrouter',
  });
  assert.equal(forced.provider, 'openrouter');
});

test('sanitizeApiKey strips quotes, whitespace, and accidental Bearer prefix', () => {
  assert.equal(sanitizeApiKey('  "gsk_abc123"  '), 'gsk_abc123');
  assert.equal(sanitizeApiKey("'sk-or-v1-xyz'\n"), 'sk-or-v1-xyz');
  assert.equal(sanitizeApiKey('Bearer gsk_token99'), 'gsk_token99');
  assert.equal(sanitizeApiKey(''), '');
});

test('validateKeyFormatHint warns on wrong provider key prefixes', () => {
  assert.ok(validateKeyFormatHint('groq', 'sk-or-v1-abc'));
  assert.equal(validateKeyFormatHint('groq', 'gsk_validkey'), null);
  assert.ok(validateKeyFormatHint('openrouter', 'gsk_wrong'));
  assert.equal(validateKeyFormatHint('openrouter', 'sk-or-v1-valid'), null);
});
