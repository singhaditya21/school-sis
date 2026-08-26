import { createAiToolRegistry } from '../registry';
import type { AiTool } from '../types';
import { AI_MUTATION_TOOLS } from './mutations';
import { AI_READ_TOOLS } from './reads';

/**
 * The single registry the runtime, the API route and the tests all read from.
 * Adding a capability means adding one declaration to reads.ts or mutations.ts.
 */
export const aiToolRegistry = createAiToolRegistry([
    ...AI_READ_TOOLS,
    ...AI_MUTATION_TOOLS,
] as unknown as readonly AiTool<never>[]);

export { AI_READ_TOOLS, AI_MUTATION_TOOLS };
