import { NextResponse } from 'next/server';
import { enterTenantContext, pool } from '@/lib/db';
import { z } from 'zod';
import { enqueueTenantJob } from '@/lib/worker/client';
import { requireBearerServiceAuth } from '@/lib/auth/api';
import { requireTenantHeaderMatch } from '@/lib/tenant/isolation';

// Schema for incoming IoT streams from physical hardware (RFID, Biometrics, GPS)
const IoTEventSchema = z.object({
  deviceId: z.string().trim().min(1).max(100),
  hardwareType: z.enum(['RFID_GATE', 'BIOMETRIC_SCANNER', 'BUS_GPS', 'TURNSTILE']),
  tenantId: z.string().uuid(),
  scannedToken: z.string().trim().min(1).max(256).describe('The raw RFID tag UID or biometric hash matched on device'),
  timestamp: z.string().datetime(),
  direction: z.enum(['IN', 'OUT']).optional()
});

export async function POST(req: Request) {
  try {
    const authError = requireBearerServiceAuth(req, 'IOT_INGEST_SECRET', {
      serviceName: 'IoT ingest',
    });
    if (authError) return authError;

    const markedBy = process.env.IOT_SYSTEM_USER_ID;
    if (!markedBy) {
      return NextResponse.json({ error: 'IoT system user is not configured' }, { status: 503 });
    }

    const body = await req.json();
    const parsedEvent = IoTEventSchema.parse(body);
    const tenantHeaderError = requireTenantHeaderMatch(req, parsedEvent.tenantId);
    if (tenantHeaderError) return tenantHeaderError;

    const tenantId = parsedEvent.tenantId;
    enterTenantContext(tenantId);

    // Resolve the scanned token to a tenant-scoped student record.
    const studentRes = await pool.query(
      `SELECT ht.student_id, s.section_id
       FROM hardware_tokens ht
       JOIN students s ON s.id = ht.student_id AND s.tenant_id = ht.tenant_id
       WHERE ht.token_id = $1
         AND ht.tenant_id = $2
         AND ht.is_active = true
       LIMIT 1`,
      [parsedEvent.scannedToken, tenantId]
    );

    if (studentRes.rowCount === 0) {
      return NextResponse.json({ error: 'Unrecognized Token' }, { status: 404 });
    }

    const studentId = studentRes.rows[0].student_id;
    const sectionId = studentRes.rows[0].section_id;

    const updateRes = await pool.query(
      `UPDATE attendance_records
       SET status = 'PRESENT', updated_at = NOW()
       WHERE tenant_id = $1 AND student_id = $2 AND date = CURRENT_DATE
       RETURNING id`,
      [tenantId, studentId]
    );

    if (updateRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO attendance_records
           (id, tenant_id, student_id, section_id, date, status, marked_by, remarks, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, CURRENT_DATE, 'PRESENT', $4, $5, NOW(), NOW())`,
        [tenantId, studentId, sectionId, markedBy, `IoT ${parsedEvent.hardwareType} scan from ${parsedEvent.deviceId}`]
      );
    }

    await enqueueTenantJob(
      'process-iot-attendance-scan',
      tenantId,
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
