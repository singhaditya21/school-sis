/**
 * Background Job Queue Service.
 * 
 * Architecture:
 * - In development: jobs execute synchronously (no Redis dependency)
 * - In production: swap to BullMQ + Redis for reliable async processing
 * 
 * Usage:
 *   import { enqueueJob } from '@/lib/services/jobs';
 *   await enqueueJob('send-sms', { phone: '...', message: '...' });
 *   await enqueueJob('email', { to: '...', subject: '...', body: '...' });
 *   await enqueueJob('generate-report', { type: 'attendance', date: '...' });
 */

export type JobType =
    | 'send-sms'
    | 'send-email'
    | 'send-whatsapp'
    | 'generate-report'
    | 'bulk-invoice'
    | 'attendance-reminder'
    | 'fee-reminder'
    | 'sync-data';

export interface JobPayload {
    [key: string]: unknown;
}

export interface JobResult {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
}

// Job handlers registry
const handlers: Record<string, (payload: JobPayload) => Promise<unknown>> = {};

export function registerHandler(type: JobType, handler: (payload: JobPayload) => Promise<unknown>) {
    handlers[type] = handler;
}

// ─── Dev Mode: Synchronous Execution ──────────────────────
async function executeSyncJob(type: string, payload: JobPayload): Promise<JobResult> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const handler = handlers[type];
    if (!handler) {
        console.warn(`[Jobs] No handler registered for type: ${type}`);
        return { jobId, status: 'completed', result: { skipped: true, reason: 'no handler' } };
    }

    try {
        const result = await handler(payload);
        console.log(`[Jobs] ✓ ${type} completed (${jobId})`);
        return { jobId, status: 'completed', result };
    } catch (error: any) {
        console.error(`[Jobs] ✗ ${type} failed (${jobId}):`, error.message);
        return { jobId, status: 'failed', error: error.message };
    }
}

// ─── Production Mode: BullMQ (activate when Redis available) ─
// async function enqueueBullMQ(type: string, payload: JobPayload): Promise<JobResult> {
//     const { Queue } = await import('bullmq');
//     const connection = { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') };
//     const queue = new Queue('school-sis', { connection });
//     const job = await queue.add(type, payload, { removeOnComplete: 100, removeOnFail: 50 });
//     return { jobId: job.id!, status: 'queued' };
// }

// ─── Public API ───────────────────────────────────────────
export async function enqueueJob(type: JobType, payload: JobPayload): Promise<JobResult> {
    const mode = process.env.JOB_QUEUE_MODE || 'sync';

    if (mode === 'bullmq') {
        // return enqueueBullMQ(type, payload);
        throw new Error('BullMQ mode requires Redis. Set JOB_QUEUE_MODE=sync or install bullmq + start Redis.');
    }

    return executeSyncJob(type, payload);
}

// ─── Pre-registered Handlers ──────────────────────────────
registerHandler('send-sms', async (payload) => {
    const { phone, message } = payload as { phone: string; message: string };
    // TODO: Integrate with Gupshup/Msg91
    console.log(`[SMS] Would send to ${phone}: ${message}`);
    return { sent: true, provider: 'mock' };
});

registerHandler('send-email', async (payload) => {
    const { to, subject, body } = payload as { to: string; subject: string; body: string };
    // TODO: Integrate with Resend/SendGrid/Nodemailer
    console.log(`[Email] Would send to ${to}: ${subject}`);
    return { sent: true, provider: 'mock' };
});

registerHandler('send-whatsapp', async (payload) => {
    const { phone, template, params } = payload as { phone: string; template: string; params: Record<string, string> };
    // TODO: Integrate with Gupshup WhatsApp Business API
    console.log(`[WhatsApp] Would send template ${template} to ${phone}`);
    return { sent: true, provider: 'mock' };
});

registerHandler('fee-reminder', async (payload) => {
    const { studentId, invoiceId, dueDate } = payload as { studentId: string; invoiceId: string; dueDate: string };
    console.log(`[FeeReminder] Student ${studentId}, Invoice ${invoiceId}, Due ${dueDate}`);
    return { reminded: true };
});

registerHandler('attendance-reminder', async (payload) => {
    const { sectionId, date } = payload as { sectionId: string; date: string };
    console.log(`[AttendanceReminder] Section ${sectionId}, Date ${date}`);
    return { reminded: true };
});
