import { quickAddJob } from 'graphile-worker';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/school_sis';

/**
 * Adds a background job to the native Postgres queue via Graphile Worker.
 * Completely replaces Inngest and Redis (BullMQ), enabling zero-cost reliable background jobs.
 */
export async function enqueueJob(taskName: string, payload: any) {
  try {
    await quickAddJob(
      { connectionString: DATABASE_URL },
      taskName,
      payload
    );
    console.log(`Successfully enqueued Postgres background job: ${taskName}`);
  } catch (error) {
    console.error('Failed to enqueue job to Graphile Worker:', error);
    throw error;
  }
}
