import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import { tasks } from '@/lib/worker/tasks';

type BackgroundJobRow = {
  id: string;
  tenantId: string | null;
  scope: 'TENANT' | 'PLATFORM';
  taskName: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
};

export type DispatchJobsOptions = {
  limit?: number;
  queue?: string;
  workerId?: string;
};

export type DispatchJobsResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  jobs: Array<{
    jobId: string;
    taskName: string;
    status: 'SUCCEEDED' | 'FAILED' | 'DEAD_LETTER';
    error?: string;
  }>;
};

function backoffForAttempt(attempt: number): string {
  const minutes = Math.min(120, Math.max(1, attempt * attempt * 2));
  return `${minutes} minutes`;
}

async function claimDueJobs(options: Required<DispatchJobsOptions>): Promise<BackgroundJobRow[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `WITH next_jobs AS (
          SELECT id
          FROM background_jobs
          WHERE queue = $1
            AND status IN ('QUEUED', 'SCHEDULED', 'FAILED')
            AND available_at <= NOW()
            AND attempts < max_attempts
          ORDER BY priority DESC, available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE background_jobs bj
       SET status = 'RUNNING',
           locked_at = NOW(),
           locked_by = $3,
           updated_at = NOW()
       WHERE bj.id IN (SELECT id FROM next_jobs)
       RETURNING bj.id,
                 bj.tenant_id AS "tenantId",
                 bj.scope,
                 bj.task_name AS "taskName",
                 bj.payload,
                 bj.attempts,
                 bj.max_attempts AS "maxAttempts"`,
      [options.queue, options.limit, options.workerId],
    );
    await client.query('COMMIT');
    return rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertAttempt(job: BackgroundJobRow, attemptNumber: number, workerId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO background_job_attempts (
        job_id, tenant_id, attempt_number, status, worker_id
     )
     VALUES ($1, $2, $3, 'RUNNING', $4)
     RETURNING id`,
    [job.id, job.tenantId, attemptNumber, workerId],
  );
  return rows[0].id;
}

async function markAttemptSucceeded(attemptId: string, result: unknown) {
  await pool.query(
    `UPDATE background_job_attempts
     SET status = 'SUCCEEDED',
         result = $1::jsonb,
         finished_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(result ?? {}) || '{}', attemptId],
  );
}

async function markAttemptFailed(attemptId: string, error: string) {
  await pool.query(
    `UPDATE background_job_attempts
     SET status = 'FAILED',
         error = $1,
         finished_at = NOW()
     WHERE id = $2`,
    [error, attemptId],
  );
}

async function markJobSucceeded(job: BackgroundJobRow, attemptNumber: number, result: unknown) {
  await pool.query(
    `UPDATE background_jobs
     SET status = 'SUCCEEDED',
         attempts = $1,
         result = $2::jsonb,
         last_error = NULL,
         locked_at = NULL,
         locked_by = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [attemptNumber, JSON.stringify(result ?? {}) || '{}', job.id],
  );
}

async function markJobFailed(job: BackgroundJobRow, attemptNumber: number, error: string) {
  const deadLetter = attemptNumber >= job.maxAttempts;
  await pool.query(
    `UPDATE background_jobs
     SET status = $1,
         attempts = $2,
         last_error = $3,
         locked_at = NULL,
         locked_by = NULL,
         available_at = CASE
            WHEN $1 = 'FAILED' THEN NOW() + INTERVAL '${backoffForAttempt(attemptNumber)}'
            ELSE available_at
         END,
         completed_at = CASE WHEN $1 = 'DEAD_LETTER' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $4`,
    [deadLetter ? 'DEAD_LETTER' : 'FAILED', attemptNumber, error, job.id],
  );
}

async function executeJob(job: BackgroundJobRow): Promise<unknown> {
  const handler = tasks[job.taskName as keyof typeof tasks];
  if (!handler) {
    throw new Error(`No task registered for ${job.taskName}.`);
  }

  if (job.scope === 'TENANT') {
    if (!job.tenantId) {
      throw new Error('Tenant job is missing tenantId.');
    }
    return runWithTenantContext(job.tenantId, () => handler(job.payload));
  }

  return runWithRlsBypass(() => handler(job.payload));
}

export async function dispatchDueJobs(options: DispatchJobsOptions = {}): Promise<DispatchJobsResult> {
  const normalized = {
    limit: Math.max(1, Math.min(options.limit ?? 10, 100)),
    queue: options.queue || 'default',
    workerId: options.workerId || `vercel-${process.env.VERCEL_REGION || 'local'}-${process.pid}`,
  };

  const jobs = await runWithRlsBypass(() => claimDueJobs(normalized));
  const result: DispatchJobsResult = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
    jobs: [],
  };

  for (const job of jobs) {
    const attemptNumber = job.attempts + 1;
    const attemptId = await runWithRlsBypass(() => insertAttempt(job, attemptNumber, normalized.workerId));

    try {
      const taskResult = await executeJob(job);
      await runWithRlsBypass(() => markAttemptSucceeded(attemptId, taskResult));
      await runWithRlsBypass(() => markJobSucceeded(job, attemptNumber, taskResult));
      result.succeeded += 1;
      result.jobs.push({ jobId: job.id, taskName: job.taskName, status: 'SUCCEEDED' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job execution failed';
      const deadLetter = attemptNumber >= job.maxAttempts;
      await runWithRlsBypass(() => markAttemptFailed(attemptId, message));
      await runWithRlsBypass(() => markJobFailed(job, attemptNumber, message));
      if (deadLetter) {
        result.deadLettered += 1;
        result.jobs.push({ jobId: job.id, taskName: job.taskName, status: 'DEAD_LETTER', error: message });
      } else {
        result.failed += 1;
        result.jobs.push({ jobId: job.id, taskName: job.taskName, status: 'FAILED', error: message });
      }
    }
  }

  return result;
}
