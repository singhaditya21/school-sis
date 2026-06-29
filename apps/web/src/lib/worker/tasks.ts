import { NotificationService } from '../services/notifications';
import { pool } from '../db/client';

/**
 * Task definitions for Graphile Worker.
 * These tasks run entirely inside our Postgres DB using its native job queue.
 */
export const tasks = {
  /**
   * Processes the IoT Attendance Scan and sends a native push notification.
   */
  'process-iot-attendance-scan': async (payload: any) => {
    const { studentId, timestamp, hardwareType } = payload;
    
    // In a real app, query the database to find the parent's Firebase Device Token
    const parentRes = await pool.query(
      `SELECT fcm_token FROM users WHERE id = (
         SELECT parent_id FROM student_parents WHERE student_id = $1 LIMIT 1
       )`,
      [studentId]
    );

    if (parentRes.rowCount > 0 && parentRes.rows[0].fcm_token) {
      const fcmToken = parentRes.rows[0].fcm_token;
      
      // Zero-cost Push Notification via Firebase
      await NotificationService.sendParentAlert(
        fcmToken,
        'Student Checked In',
        `Your child was scanned in via ${hardwareType} at ${new Date(timestamp).toLocaleTimeString()}.`,
        { type: 'ATTENDANCE_ALERT', studentId }
      );
    } else {
      console.log(`[Task Runner] No FCM token found for student ${studentId}.`);
    }
  }
};
