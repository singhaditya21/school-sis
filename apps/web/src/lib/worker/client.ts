import { quickAddJob } from 'graphile-worker';
import {
  createPlatformJobPayload,
  createTenantJobPayload,
  type PlatformJobPayload,
  type TenantJobPayload,
} from '@/lib/tenant/isolation';

type GraphileJobPayload = TenantJobPayload | PlatformJobPayload;

/**
 * Adds a background job to the native Postgres queue via Graphile Worker.
 * Completely replaces Inngest and Redis (BullMQ), enabling zero-cost reliable background jobs.
 */
export async function enqueueJob(taskName: string, payload: GraphileJobPayload) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required for background jobs.');
  }

  try {
    await quickAddJob(
      { connectionString: databaseUrl },
      taskName,
      payload
    );
    console.log(`Successfully enqueued Postgres background job: ${taskName}`);
  } catch (error) {
    console.error('Failed to enqueue job to Graphile Worker:', error);
    throw error;
  }
}

export async function enqueueTenantJob(
  taskName: string,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  return enqueueJob(taskName, createTenantJobPayload(tenantId, payload));
}

export async function enqueuePlatformJob(
  taskName: string,
  payload: Record<string, unknown>,
) {
  return enqueueJob(taskName, createPlatformJobPayload(payload));
}
