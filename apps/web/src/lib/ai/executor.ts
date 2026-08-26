/**
 * The tool executor — the one place where a model-produced tool call becomes an
 * actual operation.
 *
 * Order of checks, none of which the model can influence:
 *   1. The tool must exist in the registry.
 *   2. The caller's role must hold the permission the tool declares. This is
 *      re-checked here even though the registry already filtered the tool list,
 *      because "the model was only shown safe tools" is not an access control.
 *   3. Arguments must satisfy the tool's schema. A rejection reports the failing
 *      *paths*, never the failing values.
 *   4. Reads run tenant-scoped. Mutations are converted into a workflow approval
 *      request and stop there.
 */
import { z } from 'zod';
import {
    createPersistedWorkflowApprovalRequest,
    WorkflowApprovalError,
    type AuthorizationRole,
} from '@school-sis/api';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import type { AiToolRegistry } from './registry';
import type { AiTool, AiToolContext, AiToolModelResult, AiToolRun } from './types';

const MODEL_ROW_LIMIT = 25;

function refusal(toolName: string, kind: AiToolRun['kind'], reason: string): AiToolRun {
    return { status: 'refused', toolName, kind, reason };
}

function issuePaths(error: z.ZodError): string {
    const paths = error.issues.map((issue) => issue.path.join('.') || '(root)');
    return [...new Set(paths)].join(', ');
}

export interface AiToolExecution {
    run: AiToolRun;
    /** The narrow view handed back to the model. */
    modelResult: AiToolModelResult;
}

export async function executeAiTool(
    registry: AiToolRegistry,
    toolName: string,
    rawInput: unknown,
    context: AiToolContext,
): Promise<AiToolExecution> {
    const tool = registry.get(toolName) as AiTool<unknown> | null;
    if (!tool) {
        const run = refusal(toolName, 'read', `"${toolName}" is not a tool this assistant has.`);
        return { run, modelResult: { ok: false, summary: run.status === 'refused' ? run.reason : '' } };
    }

    if (!hasPermission(context.role as UserRole, tool.permission)) {
        const run = refusal(
            tool.name,
            tool.kind,
            `Your role does not hold ${tool.permission}, so ${tool.name} was not run.`,
        );
        return { run, modelResult: { ok: false, summary: run.status === 'refused' ? run.reason : '' } };
    }

    const parsed = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
        const run = refusal(
            tool.name,
            tool.kind,
            `${tool.name} was called with unusable arguments (${issuePaths(parsed.error)}). Nothing ran.`,
        );
        return { run, modelResult: { ok: false, summary: run.status === 'refused' ? run.reason : '' } };
    }

    try {
        if (tool.kind === 'read') {
            const output = await tool.run(parsed.data, context);
            const run: AiToolRun = { status: 'read', toolName: tool.name, kind: 'read', output };
            return {
                run,
                modelResult: {
                    ok: true,
                    summary: output.summary,
                    rowCount: output.rows.length,
                    rows: output.rows.slice(0, MODEL_ROW_LIMIT),
                },
            };
        }

        const proposal = await tool.propose(parsed.data, context);
        if ('refused' in proposal) {
            const run = refusal(tool.name, 'mutation', proposal.refused);
            return { run, modelResult: { ok: false, summary: proposal.refused } };
        }

        const approval = await createPersistedWorkflowApprovalRequest({
            policyId: tool.approvalPolicyId,
            tenantId: context.tenantId,
            title: proposal.title,
            description: proposal.description,
            priority: proposal.priority,
            reason: proposal.reason,
            resource: { ...proposal.resource, tenantId: context.tenantId },
            payload: proposal.payload,
            requestedBy: {
                userId: context.userId,
                role: context.role as AuthorizationRole,
                tenantId: context.tenantId,
            },
        });

        const summary = `Nothing was changed. Approval request ${approval.id} was raised under policy ${approval.policyId} and is ${approval.status}. It needs ${approval.minApprovals} approval(s) from ${approval.requiredApproverRoles.join(' or ')} on the Approvals queue.`;
        const run: AiToolRun = {
            status: 'approval_requested',
            toolName: tool.name,
            kind: 'mutation',
            approvalRequestId: approval.id,
            approvalStatus: approval.status,
            policyId: approval.policyId,
            summary,
        };
        return { run, modelResult: { ok: true, summary, approvalRequestId: approval.id } };
    } catch (error) {
        const message =
            error instanceof WorkflowApprovalError
                ? error.message
                : `${tool.name} could not complete. Nothing was changed.`;
        const run = refusal(tool.name, tool.kind, message);
        return { run, modelResult: { ok: false, summary: message } };
    }
}
