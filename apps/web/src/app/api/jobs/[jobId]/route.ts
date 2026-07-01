import { NextRequest, NextResponse } from 'next/server';
import { pool, runWithRlsBypass } from '@/lib/db';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isPlatformRole(role: string): boolean {
  return ROLE_GROUPS.platform.includes(role as typeof ROLE_GROUPS.platform[number]);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireApiAuth(ROLE_GROUPS.tenantAdmins);
  if (auth.ok === false) return auth.response;

  const { jobId } = await params;
  const platform = isPlatformRole(auth.context.role);

  const load = async () => {
    const jobValues: unknown[] = [jobId];
    const jobTenantFilter = platform ? '' : 'AND tenant_id = $2';
    if (!platform) jobValues.push(auth.context.tenantId);

    const { rows: jobs } = await pool.query(
      `SELECT id,
              tenant_id AS "tenantId",
              scope,
              queue,
              task_name AS "taskName",
              status,
              priority,
              payload,
              idempotency_key AS "idempotencyKey",
              scheduled_for AS "scheduledFor",
              available_at AS "availableAt",
              attempts,
              max_attempts AS "maxAttempts",
              locked_at AS "lockedAt",
              locked_by AS "lockedBy",
              last_error AS "lastError",
              result,
              created_by AS "createdBy",
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              completed_at AS "completedAt"
       FROM background_jobs
       WHERE id = $1 ${jobTenantFilter}
       LIMIT 1`,
      jobValues,
    );

    const job = jobs[0];
    if (!job) return null;

    const tenantValues: unknown[] = [jobId];
    const tenantFilter = platform ? '' : 'AND tenant_id = $2';
    if (!platform) tenantValues.push(auth.context.tenantId);

    const [{ rows: attempts }, { rows: notifications }] = await Promise.all([
      pool.query(
        `SELECT id,
                attempt_number AS "attemptNumber",
                status,
                worker_id AS "workerId",
                started_at AS "startedAt",
                finished_at AS "finishedAt",
                error,
                result
         FROM background_job_attempts
         WHERE job_id = $1 ${tenantFilter}
         ORDER BY attempt_number ASC`,
        tenantValues,
      ),
      pool.query(
        `SELECT id,
                channel,
                status,
                provider,
                recipient,
                subject,
                attempts,
                max_attempts AS "maxAttempts",
                provider_message_id AS "providerMessageId",
                last_error AS "lastError",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                sent_at AS "sentAt"
         FROM notification_outbox
         WHERE job_id = $1 ${tenantFilter}
         ORDER BY created_at DESC`,
        tenantValues,
      ),
    ]);

    return { ...job, attempts: attempts || [], notifications: notifications || [] };
  };

  const job = platform ? await runWithRlsBypass(load) : await load();
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
