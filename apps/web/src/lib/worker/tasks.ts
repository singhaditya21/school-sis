import { pool } from '@/lib/db';
import { NotificationService } from '@/lib/services/notifications';
import { getTenantIdFromJobPayload } from '@/lib/tenant/isolation';

/**
 * Task definitions for Graphile Worker.
 * These tasks run entirely inside our Postgres DB using its native job queue.
 */
export const tasks = {
  /**
   * Processes the IoT Attendance Scan and sends a native push notification.
   */
  'process-iot-attendance-scan': async (payload: any) => {
    const tenantId = getTenantIdFromJobPayload(payload);
    const { studentId, timestamp, hardwareType } = payload;
    
    // In a real app, query the database to find the parent's Firebase Device Token
    const parentRes = await pool.query(
      `SELECT u.fcm_token
       FROM guardians g
       JOIN users u ON u.id = g.user_id AND u.tenant_id = g.tenant_id
       WHERE g.student_id = $1
         AND g.tenant_id = $2
         AND g.is_primary = true
       LIMIT 1`,
      [studentId, tenantId]
    );

    if (parentRes.rowCount > 0 && parentRes.rows[0].fcm_token) {
      const fcmToken = parentRes.rows[0].fcm_token;
      
      // Zero-cost Push Notification via Firebase
      await NotificationService.sendParentAlert(
        fcmToken,
        'Student Checked In',
        `Your child was scanned in via ${hardwareType} at ${new Date(timestamp).toLocaleTimeString()}.`,
        { type: 'ATTENDANCE_ALERT', studentId, tenantId }
      );
    } else {
      console.log(`[Task Runner] No FCM token found for tenant ${tenantId} student ${studentId}.`);
    }
  }
};
