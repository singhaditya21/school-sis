import type { LanguageModel } from 'ai';
import {
  createFallbackLanguageModel,
  isRetryableProviderFailure,
  loadCopilotProviderPlan,
} from '@/lib/ai/providers';

type TestModel = {
  doStream: jest.Mock<Promise<string>, []>;
  doGenerate: jest.Mock<Promise<string>, []>;
};

function languageModel(stream: TestModel['doStream'], generate = jest.fn()): LanguageModel {
  return { doStream: stream, doGenerate: generate } as unknown as LanguageModel;
}

describe('copilot provider fallback policy', () => {
  it.each([408, 425, 429, 500, 503])('classifies HTTP %i as retryable', (statusCode) => {
    expect(isRetryableProviderFailure({ statusCode })).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('does not fallback for HTTP %i', (statusCode) => {
    expect(isRetryableProviderFailure({ statusCode })).toBe(false);
  });

  it('falls back once for availability failure and resets selection on a later primary success', async () => {
    const primaryStream = jest.fn()
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce('primary-ok');
    const fallbackStream = jest.fn().mockResolvedValue('fallback-ok');
    const wrapped = createFallbackLanguageModel({
      primary: { model: languageModel(primaryStream), name: 'primary', modelId: 'p1' },
      fallback: { model: languageModel(fallbackStream), name: 'fallback', modelId: 'f1' },
    });
    const model = wrapped.model as unknown as TestModel;

    await expect(model.doStream()).resolves.toBe('fallback-ok');
    expect(wrapped.selection()).toEqual({ name: 'fallback', model: 'f1', usedFallback: true });
    await expect(model.doStream()).resolves.toBe('primary-ok');
    expect(wrapped.selection()).toEqual({ name: 'primary', model: 'p1', usedFallback: false });
    expect(fallbackStream).toHaveBeenCalledTimes(1);
  });

  it('preserves primary auth/config failures without sending the prompt to fallback', async () => {
    const primaryStream = jest.fn().mockRejectedValue({ statusCode: 401 });
    const fallbackStream = jest.fn().mockResolvedValue('must-not-run');
    const wrapped = createFallbackLanguageModel({
      primary: { model: languageModel(primaryStream), name: 'primary', modelId: 'p1' },
      fallback: { model: languageModel(fallbackStream), name: 'fallback', modelId: 'f1' },
    });
    const model = wrapped.model as unknown as TestModel;

    await expect(model.doStream()).rejects.toEqual({ statusCode: 401 });
    expect(fallbackStream).not.toHaveBeenCalled();
    expect(wrapped.selection()).toEqual({ name: 'primary', model: 'p1', usedFallback: false });
  });

  it('requires an all-or-nothing fallback configuration', () => {
    expect(() => loadCopilotProviderPlan({
      CEREBRAS_API_KEY: 'primary-key',
      COPILOT_FALLBACK_API_KEY: 'fallback-key',
    })).toThrow('requires COPILOT_FALLBACK_API_KEY');
  });
});
