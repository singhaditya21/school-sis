import {
  actualAiCostMicrousd,
  aiBudgetErrorResponse,
  AiBudgetExceededError,
  estimateAiBudget,
  estimateInputTokens,
  loadAiBudgetPolicy,
} from '@/lib/ai/budget';

describe('AI budget policy', () => {
  it('loads bounded tenant and user ceilings', () => {
    const policy = loadAiBudgetPolicy({
      AI_TENANT_MONTHLY_TOKEN_BUDGET: '10000',
      AI_USER_MONTHLY_TOKEN_BUDGET: '1000',
      AI_TENANT_MONTHLY_COST_USD: '20',
      AI_USER_MONTHLY_COST_USD: '2',
      AI_MAX_OUTPUT_TOKENS: '256',
    });

    expect(policy).toEqual({
      tenantMonthlyTokens: 10000,
      tenantMonthlyCostMicrousd: 20_000_000,
      userMonthlyTokens: 1000,
      userMonthlyCostMicrousd: 2_000_000,
      maxOutputTokens: 256,
    });
  });

  it('fails closed for invalid or inverted budget configuration', () => {
    expect(() => loadAiBudgetPolicy({ AI_MAX_OUTPUT_TOKENS: 'unlimited' })).toThrow();
    expect(() => loadAiBudgetPolicy({
      AI_TENANT_MONTHLY_TOKEN_BUDGET: '100',
      AI_USER_MONTHLY_TOKEN_BUDGET: '101',
    })).toThrow('cannot exceed');
  });

  it('reserves a conservative token bound and the most expensive provider cost', () => {
    const estimate = estimateAiBudget('four', 100, [
      { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 },
      { inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 8 },
    ]);

    expect(estimate.inputTokens).toBe(estimateInputTokens('four'));
    expect(estimate.totalTokens).toBe(estimate.inputTokens + 100);
    expect(estimate.costMicrousd).toBe(
      Math.ceil(estimate.inputTokens * 5 + estimate.outputTokens * 8),
    );
  });

  it('converts actual provider usage to integer micro-USD', () => {
    expect(actualAiCostMicrousd(1000, 500, {
      inputUsdPerMillionTokens: 2,
      outputUsdPerMillionTokens: 4,
    })).toBe(4000);
  });

  it('returns a stable fail-closed budget response', async () => {
    const response = aiBudgetErrorResponse(new AiBudgetExceededError('USER'))!;
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    await expect(response.json()).resolves.toMatchObject({
      code: 'AI_BUDGET_EXCEEDED',
      scope: 'user',
    });
  });
});
