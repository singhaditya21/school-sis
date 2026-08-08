const firebaseSend = jest.fn();

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn(),
  getApps: () => [{}],
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ send: firebaseSend }),
}));

import {
  NotificationService,
  normalizeFirebaseDataPayload,
} from '@/lib/services/notifications';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FIREBASE_PROJECT_ID = 'school-sis';
  process.env.FIREBASE_CLIENT_EMAIL = 'firebase@example.edu';
  process.env.FIREBASE_PRIVATE_KEY = 'private-key';
});

describe('Firebase notification payload safety', () => {
  it('normalizes supported primitives and drops values Firebase data messages reject', () => {
    expect(normalizeFirebaseDataPayload({
      attendanceId: 'attendance-1',
      absenceCount: 2,
      requiresAction: true,
      nested: { unsafe: true },
      list: ['unsafe'],
      empty: null,
      invalidNumber: Number.NaN,
    })).toEqual({
      attendanceId: 'attendance-1',
      absenceCount: '2',
      requiresAction: 'true',
    });
  });

  it('sends only normalized string data to Firebase Admin', async () => {
    firebaseSend.mockResolvedValue('projects/school-sis/messages/1');

    await expect(NotificationService.sendParentAlert(
      'device-token',
      'Attendance',
      'Student marked present.',
      { attendanceId: 'attendance-1', count: 2, nested: { unsafe: true } },
    )).resolves.toEqual({ success: true, messageId: 'projects/school-sis/messages/1' });

    expect(firebaseSend).toHaveBeenCalledWith(expect.objectContaining({
      data: { attendanceId: 'attendance-1', count: '2' },
    }));
  });
});
