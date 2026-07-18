import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import {
  createPlatformJobPayload,
  createTenantJobPayload,
  getTenantIdFromJobPayload,
  type PlatformJobPayload,
  type TenantJobPayload,
} from '@/lib/tenant/isolation';
import { logger } from '@/lib/observability/logger';

type GraphileJobPayload = TenantJobPayload | PlatformJobPayload;

export type EnqueueJobOptions = {
  queue?: string;
  priority?: number;
  idempotencyKey?: string;
  scheduledFor?: Date | string;
  maxAttempts?: number;
  createdBy?: string;
};

export type EnqueueJobResult = {
  jobId: string;
  status: string;
  existing: boolean;
};

function isPlatformPayload(payload: GraphileJobPayload): payload is PlatformJobPayload {
  return payload.scope === 'platform';
}

function scheduledDate(value: Date | string | undefined): Date {
  if (!value) return new Date();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid scheduledFor value.');
  }
  return parsed;
}

function initialStatus(availableAt: Date): 'QUEUED' | 'SCHEDULED' {
  return availableAt.getTime() > Date.now() ? 'SCHEDULED' : 'QUEUED';
}

async function findExistingJob(params: {
  tenantId: string | null;
  idempotencyKey?: string;
}): Promise<EnqueueJobResult | null> {
  if (!params.idempotencyKey) return null;

  const { rows } = await pool.query(
    `SELECT id, status
     FROM background_jobs
     WHERE idempotency_key = $1
       AND (
         ($2::uuid IS NOT NULL AND tenant_id = $2::uuid)
         OR ($2::uuid IS NULL AND tenant_id IS NULL)
       )
     LIMIT 1`,
    [params.idempotencyKey, params.tenantId],
  );

  if (!rows[0]) return null;
  return { jobId: rows[0].id, status: rows[0].status, existing: true };
}

async function persistJob(
  taskName: string,
  payload: GraphileJobPayload,
  options: EnqueueJobOptions,
): Promise<EnqueueJobResult> {
  const tenantId = isPlatformPayload(payload) ? null : getTenantIdFromJobPayload(payload);
  const scope = tenantId ? 'TENANT' : 'PLATFORM';
  const queue = options.queue || 'default';
  const priority = options.priority ?? 0;
  const maxAttempts = options.maxAttempts ?? 3;
  const availableAt = scheduledDate(options.scheduledFor);
  const status = initialStatus(availableAt);
  const query = async () => {
    const existing = await findExistingJob({ tenantId, idempotencyKey: options.idempotencyKey });
    if (existing) return existing;

    try {
      const { rows } = await pool.query(
        `INSERT INTO background_jobs (
            tenant_id, scope, queue, task_name, status, priority, payload,
            idempotency_key, scheduled_for, available_at, max_attempts, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $9, $10, $11)
         RETURNING id, status`,
        [
          tenantId,
          scope,
          queue,
          taskName,
          status,
          priority,
          JSON.stringify(payload),
          options.idempotencyKey || null,
          availableAt,
          maxAttempts,
          options.createdBy || null,
        ],
      );

      return { jobId: rows[0].id, status: rows[0].status, existing: false };
    } catch (error) {
      if ((error as { code?: string } | null | undefined)?.code === '23505' && options.idempotencyKey) {
        const existing = await findExistingJob({ tenantId, idempotencyKey: options.idempotencyKey });
        if (existing) return existing;
      }
      throw error;
    }
  };

  if (tenantId) {
    return runWithTenantContext(tenantId, query);
  }
  return runWithRlsBypass(query);
}

/**
 * Adds a tenant-aware durable background job. The database queue is the runtime source of truth.
 */
export async function enqueueJob(
  taskName: string,
  payload: GraphileJobPayload,
  options: EnqueueJobOptions = {},
): Promise<EnqueueJobResult> {
  const persisted = await persistJob(taskName, payload, options);

  if (!persisted.existing && process.env.JOB_QUEUE_MODE === 'graphile') {
    throw new Error('JOB_QUEUE_MODE=graphile is no longer bundled in the web runtime. Use JOB_QUEUE_MODE=database and /api/jobs/dispatch.');
  }

  logger.info('background_job.enqueued', 'Background job enqueued', {
    source: 'worker',
    entityType: 'background_job',
    entityId: persisted.jobId,
    metadata: {
      taskName,
      status: persisted.status,
      existing: persisted.existing,
    },
  });

  return persisted;
}

export async function enqueueTenantJob(
  taskName: string,
  tenantId: string,
  payload: Record<string, unknown>,
  options?: EnqueueJobOptions,
) {
  return enqueueJob(taskName, createTenantJobPayload(tenantId, payload), options);
}

export async function enqueuePlatformJob(
  taskName: string,
  payload: Record<string, unknown>,
  options?: EnqueueJobOptions,
) {
  return enqueueJob(taskName, createPlatformJobPayload(payload), options);
}
