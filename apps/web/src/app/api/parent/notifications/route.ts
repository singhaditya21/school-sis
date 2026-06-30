import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';

export async function GET(req: Request) {
  try {
    const auth = await requireApiAuth(['PARENT']);
    if (auth.ok === false) return auth.response;

    const studentRes = await pool.query(
      `SELECT student_id
       FROM guardians
       WHERE user_id = $1 AND tenant_id = $2`,
      [auth.context.userId, auth.context.tenantId]
    );

    if (studentRes.rowCount === 0) {
      return NextResponse.json({ notifications: [] });
    }

    const studentIds = studentRes.rows.map((r: { student_id: string }) => r.student_id);

    const attendanceRes = await pool.query(
      `SELECT a.id, a.date, a.status, s.first_name, s.last_name 
       FROM attendance_records a
       JOIN students s ON a.student_id = s.id
       WHERE a.tenant_id = $2
         AND a.student_id = ANY($1::uuid[])
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [studentIds, auth.context.tenantId]
    );

    const notifications = attendanceRes.rows.map((row: {
      id: string;
      date: string | Date;
      status: string;
      first_name: string;
      last_name: string;
    }) => ({
      id: row.id,
      title: row.status === 'PRESENT' ? 'Student Checked In' : 'Attendance Alert',
      message: `${row.first_name} ${row.last_name} was marked ${row.status.toLowerCase()} for school.`,
      time: new Date(row.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      type: row.status === 'PRESENT' ? 'TAP_IN' : 'ALERT',
      icon: row.status === 'PRESENT' ? 'CHECK_IN' : 'ALERT'
    }));

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Failed to fetch parent notifications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
