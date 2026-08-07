import { NextRequest } from 'next/server';
import { dispatchDueJobs } from '@/lib/worker/dispatcher';
import { processDueNotifications } from '@/lib/notifications/outbox';
import { GET as cronDispatchGet, POST as manualDispatchPost } from '@/app/api/jobs/dispatch/route';

jest.mock('@/lib/worker/dispatcher', () => ({
    dispatchDueJobs: jest.fn(),
}));

jest.mock('@/lib/notifications/outbox', () => ({
    processDueNotifications: jest.fn(),
}));

const ORIGINAL_ENV = process.env;

function bearer(secret: string) {
    return { Authorization: `Bearer ${secret}` };
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
    delete process.env.CRON_SECRET;
    delete process.env.JOB_DISPATCH_SECRET;
    (dispatchDueJobs as jest.Mock).mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 });
    (processDueNotifications as jest.Mock).mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 });
});

afterAll(() => {
    process.env = ORIGINAL_ENV;
});

describe('API route boundary contracts', () => {
    it('requires CRON_SECRET for the cron-compatible job dispatcher', async () => {
        const unconfigured = await cronDispatchGet(new Request('https://school.example.edu/api/jobs/dispatch'));
        expect(unconfigured.status).toBe(503);

        process.env.CRON_SECRET = 'cron-secret-20260704-production-value';
        const wrong = await cronDispatchGet(new Request('https://school.example.edu/api/jobs/dispatch', {
            headers: bearer('wrong-token'),
        }));
        expect(wrong.status).toBe(401);

        const ok = await cronDispatchGet(new Request('https://school.example.edu/api/jobs/dispatch', {
            headers: bearer(process.env.CRON_SECRET),
        }));
        expect(ok.status).toBe(200);
        expect(dispatchDueJobs).toHaveBeenCalledWith({ queue: 'default', limit: 10 });
        expect(processDueNotifications).toHaveBeenCalledWith(25);
    });

    it('keeps manual dispatcher POSTs on JOB_DISPATCH_SECRET and clamps operator limits', async () => {
        process.env.JOB_DISPATCH_SECRET = 'job-dispatch-20260704-production-value';

        const response = await manualDispatchPost(new Request('https://school.example.edu/api/jobs/dispatch', {
            method: 'POST',
            headers: {
                ...bearer(process.env.JOB_DISPATCH_SECRET),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                queue: 'notifications',
                limit: 500,
                notificationLimit: 500,
                sweepNotifications: false,
            }),
        }));

        expect(response.status).toBe(200);
        expect(dispatchDueJobs).toHaveBeenCalledWith({ queue: 'notifications', limit: 100 });
        expect(processDueNotifications).not.toHaveBeenCalled();
    });
});
