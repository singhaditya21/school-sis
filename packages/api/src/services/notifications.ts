import admin from 'firebase-admin';

// Zero-Cost Push Notifications replacing expensive Twilio SMS infrastructure.
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    // In production, load this securely from environment variables or KMS
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || "mock-project-id",
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "mock-email@mock.iam.gserviceaccount.com",
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n'),
    }),
  });
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

      const response = await admin.messaging().send(message);
      console.log('Successfully sent Firebase Push Notification:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.error('Error sending Firebase Push Notification:', error);
      throw error;
    }
  }
}
