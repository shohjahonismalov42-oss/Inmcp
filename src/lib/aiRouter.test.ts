import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaskDifficulty, resolveAiRoute } from './aiRouter';

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

test('resolveAiRoute maps easy -> groq, medium -> gemini, hard -> openrouter', () => {
  const easy = resolveAiRoute({ task: 'Translate hello to Uzbek', difficulty: 'easy' });
  assert.equal(easy.provider, 'groq');

  const medium = resolveAiRoute({ task: 'Summarize this page', difficulty: 'medium' });
  assert.equal(medium.provider, 'gemini');

  const hard = resolveAiRoute({ task: 'Complex refactor', difficulty: 'hard' });
  assert.equal(hard.provider, 'openrouter');
});

test('resolveAiRoute respects explicit provider override', () => {
  const forced = resolveAiRoute({
    task: 'Simple question',
    provider: 'openrouter',
  });
  assert.equal(forced.provider, 'openrouter');
});
