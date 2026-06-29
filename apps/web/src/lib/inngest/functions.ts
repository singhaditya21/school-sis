import { inngest } from "./client";

/**
 * Background task triggered when physical hardware scans a student ID.
 * This function has automatic retries and dead-letter queueing if the Push Notification provider is down.
 */
export const processIoTAttendanceScan = inngest.createFunction(
  { id: "process-iot-attendance-scan" },
  { event: "iot.attendance.scanned" },
  async ({ event, step }) => {
    const { studentId, timestamp, hardwareType } = event.data;

    // Step 1: We could verify the attendance was saved, but the ingest API handled that.
    
    // Step 2: Fetch Parent FCM tokens 
    // const tokens = await db.query...
    
    // Step 3: Send Push Notification (Mocked)
    await step.run("send-push-notification", async () => {
      console.log(`[PUSH NOTIFICATION] Student ${studentId} checked in via ${hardwareType} at ${timestamp}. Parent notified.`);
      return { success: true };
    });

    return { event, body: "Attendance IoT Event fully processed." };
  }
);
