/**
 * The AI spine: a tool registry, a tenant-scoped retrieval guard, a
 * human-approval path for anything that mutates, per-tenant cost control, and
 * content-free structured logging.
 *
 * Nothing in here executes a mutation, and nothing answers without a model
 * provider. Both are load-bearing product claims, not implementation details.
 */
export * from './types';
export { aiToolRegistry, AI_READ_TOOLS, AI_MUTATION_TOOLS } from './tools';
export { createAiToolRegistry, describeToolsForModel, AiRegistryError, type AiToolRegistry } from './registry';
export { auditTenantScopedSql, runTenantScopedRead, AiTenantScopeError } from './tenant-query';
export { executeAiTool, type AiToolExecution } from './executor';
export { checkAiBudget, readTenantAiUsage, aiBudgetLimits, estimateUsdCost, type AiBudgetState } from './budget';
export { resolveAiProvider, type AiProviderResolution, type AiProviderConfig } from './provider';
export { toModelToolName, fromModelToolName } from './model-names';
export { recordAiTurn, redactQuestion, AI_AGENT_NAME, type AiTurnOutcome } from './telemetry';
export { runAssistantTurn, createAiModel, type AiTurnResult } from './runtime';
