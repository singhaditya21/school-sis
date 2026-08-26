/**
 * The tool registry.
 *
 * A tool is the unit of leverage in this spine: adding a capability to the
 * assistant is a ~20-line declaration, not another bespoke endpoint. Registration
 * is validated at module load, so a malformed tool fails fast in CI rather than
 * at the first user request.
 */
import { getApprovalWorkflowPolicy } from '@school-sis/api';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import type { AiTool } from './types';

const NAME_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export class AiRegistryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiRegistryError';
    }
}

function assertValidTool(tool: AiTool<never>, seen: Set<string>): void {
    if (!NAME_RE.test(tool.name)) {
        throw new AiRegistryError(`Tool name must look like "domain.operation": ${tool.name}`);
    }
    if (seen.has(tool.name)) {
        throw new AiRegistryError(`Duplicate AI tool name: ${tool.name}`);
    }
    if (!tool.permission.includes(':')) {
        throw new AiRegistryError(`Tool ${tool.name} must declare a "resource:action" permission.`);
    }
    if (!tool.description.trim()) {
        throw new AiRegistryError(`Tool ${tool.name} must describe itself for the model.`);
    }
    if (tool.kind === 'mutation' && !getApprovalWorkflowPolicy(tool.approvalPolicyId)) {
        throw new AiRegistryError(
            `Tool ${tool.name} names an approval policy the workflow engine does not know: ${tool.approvalPolicyId}`,
        );
    }
    seen.add(tool.name);
}

/**
 * Freeze a set of tool declarations into a registry. Mutation tools are checked
 * against the real approval policy table, so a tool can never name a policy the
 * workflow engine does not know how to route.
 */
export function createAiToolRegistry(tools: readonly AiTool<never>[]) {
    const seen = new Set<string>();
    for (const tool of tools) {
        assertValidTool(tool, seen);
    }

    const byName = new Map<string, AiTool<never>>(tools.map((tool) => [tool.name, tool]));

    return {
        all(): readonly AiTool<never>[] {
            return tools;
        },
        get(name: string): AiTool<never> | null {
            return byName.get(name) ?? null;
        },
        /** Only the tools this role already has the permission for. */
        forRole(role: string): readonly AiTool<never>[] {
            return tools.filter((tool) => hasPermission(role as UserRole, tool.permission));
        },
    };
}

export type AiToolRegistry = ReturnType<typeof createAiToolRegistry>;

/** The catalog as the model sees it: names, permissions, kinds — never data. */
export function describeToolsForModel(tools: readonly AiTool<never>[]): string {
    return tools
        .map((tool) => {
            const consequence =
                tool.kind === 'read'
                    ? 'returns tenant-scoped rows'
                    : 'does NOT execute — it only raises a human approval request';
            return `- ${tool.name} (${tool.kind}, requires ${tool.permission}): ${tool.description} It ${consequence}.`;
        })
        .join('\n');
}
