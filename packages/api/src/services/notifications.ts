import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Zero-Cost Push Notifications replacing expensive Twilio SMS infrastructure.
function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase push notifications are not configured.');
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return getMessaging();
}

export class NotificationService {
  /**
   * Sends a 100% free Native Push Notification to a Parent's Mobile App (Expo).
   * Completely replaces our old Twilio SMS integration.
   */
  static async sendParentAlert(deviceToken: string, title: string, body: string, dataPayload: any = {}) {
    try {
      const message = {
        token: deviceToken,
        notification: {
          title,
          body,
        },
        data: dataPayload,
        android: {
          priority: 'high' as const,
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await getFirebaseMessaging().send(message);
      console.log('Successfully sent Firebase Push Notification:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('Error sending Firebase Push Notification:', error);
      throw error;
    }
  }
}
