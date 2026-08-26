/**
 * Core types for the AI spine.
 *
 * The spine exists so that "AI" in this product is a *bounded capability*, not an
 * endpoint. Every operation the model can reach is a registered tool with:
 *   - a stable name,
 *   - a typed input schema,
 *   - the RBAC permission the caller must already hold, and
 *   - a kind: `read` (answerable directly) or `mutation` (never executed — it can
 *     only raise a request on the existing workflow_approvals engine).
 *
 * Nothing here executes a mutation. That is deliberate and load-bearing: the
 * marketing claim guard forbids implying autonomous AI, and the implementation
 * must make that claim true rather than merely unsaid.
 */
import type { z } from 'zod';
import type { AuthorizationRole, WorkflowApprovalStatus } from '@school-sis/api';

export type AiToolKind = 'read' | 'mutation';

/** Everything a tool is allowed to know about who is asking. */
export interface AiToolContext {
    tenantId: string;
    userId: string;
    role: AuthorizationRole;
    /** Correlates the model turn, every tool run, and the audit row. */
    requestId: string;
}

/** One column of a read tool's result, described so the server can render it. */
export interface AiFieldSpec {
    key: string;
    label: string;
    /** `currency` values are rupees (numeric(12,2)) — never paise. */
    format: 'text' | 'number' | 'currency' | 'date';
}

export type AiRow = Record<string, string | number | null>;

export interface AiReadOutput {
    /** A sentence the SERVER composed from the rows. Never model prose. */
    summary: string;
    fields: readonly AiFieldSpec[];
    rows: readonly AiRow[];
}

export interface AiMutationProposal {
    title: string;
    description: string;
    /** Audit reason. Several policies require one, so tools always supply it. */
    reason: string;
    resource: { type: string; id?: string; label?: string };
    /** Redacted, id-shaped payload. Never free text copied out of a record. */
    payload: Record<string, unknown>;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

export interface AiReadTool<TInput> {
    kind: 'read';
    name: string;
    title: string;
    /** Description handed to the model. Keep it literal — it is a contract. */
    description: string;
    permission: string;
    inputSchema: z.ZodType<TInput>;
    run(input: TInput, context: AiToolContext): Promise<AiReadOutput>;
}

export interface AiMutationTool<TInput> {
    kind: 'mutation';
    name: string;
    title: string;
    description: string;
    permission: string;
    /** Must be an id in APPROVAL_WORKFLOW_POLICIES. Validated at registration. */
    approvalPolicyId: string;
    inputSchema: z.ZodType<TInput>;
    /**
     * Resolves the request into an approval proposal. May read (tenant-scoped) to
     * turn a human-facing identifier into a real row id, and MUST return a
     * refusal instead of guessing when the row does not exist in this tenant.
     */
    propose(input: TInput, context: AiToolContext): Promise<AiMutationProposal | { refused: string }>;
}

export type AiTool<TInput = unknown> = AiReadTool<TInput> | AiMutationTool<TInput>;

export type AiToolRun =
    | {
          status: 'read';
          toolName: string;
          kind: 'read';
          output: AiReadOutput;
      }
    | {
          status: 'approval_requested';
          toolName: string;
          kind: 'mutation';
          approvalRequestId: string;
          approvalStatus: WorkflowApprovalStatus;
          policyId: string;
          summary: string;
      }
    | {
          status: 'refused';
          toolName: string;
          kind: AiToolKind;
          reason: string;
      };

/** What the model is handed back. Deliberately narrow — never raw rows for mutations. */
export interface AiToolModelResult {
    ok: boolean;
    summary: string;
    rowCount?: number;
    rows?: readonly AiRow[];
    approvalRequestId?: string;
}
