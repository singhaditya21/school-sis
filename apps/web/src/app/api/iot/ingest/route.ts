import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { z } from 'zod';
import { enqueueJob } from '../../../lib/worker/client';

// Schema for incoming IoT streams from physical hardware (RFID, Biometrics, GPS)
const IoTEventSchema = z.object({
  deviceId: z.string(),
  hardwareType: z.enum(['RFID_GATE', 'BIOMETRIC_SCANNER', 'BUS_GPS', 'TURNSTILE']),
  tenantId: z.string().uuid(),
  scannedToken: z.string().describe('The raw RFID tag UID or biometric hash matched on device'),
  timestamp: z.string().datetime(),
  direction: z.enum(['IN', 'OUT']).optional()
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedEvent = IoTEventSchema.parse(body);

    // 1. Verify Device Authentication (skipped in this mock for brevity, would use API Keys)
    
    // 2. Resolve the scanned token to a Student ID
    // We assume there's a hardware_tokens table mapping RFID UIDs to student UUIDs.
    const studentRes = await pool.query(
      `SELECT student_id FROM hardware_tokens WHERE token_id = $1 AND tenant_id = $2 AND is_active = true LIMIT 1`,
      [parsedEvent.scannedToken, parsedEvent.tenantId]
    );

    if (studentRes.rowCount === 0) {
      // In a real system, we might log an "Unauthorized Access Attempt" to the Event Bus here.
      return NextResponse.json({ error: 'Unrecognized Token' }, { status: 404 });
    }

    const studentId = studentRes.rows[0].student_id;

    // 3. Automatically Log Attendance 
    await pool.query(
      `INSERT INTO attendance (id, tenant_id, student_id, date, status, recorded_by, created_at, updated_at) 
       VALUES (gen_random_uuid(), $1, $2, CURRENT_DATE, 'PRESENT', 'IOT_SYSTEM', NOW(), NOW())
       ON CONFLICT (student_id, date) DO UPDATE SET updated_at = NOW()`,
      [parsedEvent.tenantId, studentId]
    );

    // 4. Trigger Worker to send a Push Notification to the Parent's Mobile App
    await enqueueJob(
      'process-iot-attendance-scan',
      {
        studentId,
        timestamp: parsedEvent.timestamp,
        hardwareType: parsedEvent.hardwareType,
        deviceId: parsedEvent.deviceId
      }
    );

    return NextResponse.json({ success: true, message: 'IoT Event Processed' }, { status: 202 });

  } catch (error) {
    console.error('IoT Ingestion Error:', error);
    return NextResponse.json({ error: 'Invalid Payload or Server Error' }, { status: 400 });
  }
}
