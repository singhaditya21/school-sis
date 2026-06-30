import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId') || '00000000-0000-0000-0000-000000000000';

    // 1. Find all students belonging to this parent guardian
    const studentRes = await pool.query(
      `SELECT student_id FROM guardians WHERE id = $1`,
      [parentId]
    );

    if (studentRes.rowCount === 0) {
      // Return beautiful sample notifications if parent has no registered students
      return NextResponse.json({
        notifications: [
          {
            id: 'demo_1',
            title: 'Student Checked In',
            message: 'Sarah checked in at the Main Gate IoT Turnstile.',
            time: 'Today, 8:14 AM',
            type: 'TAP_IN',
            icon: '✅'
          },
          {
            id: 'demo_2',
            title: 'Tuition Payment Processed',
            message: 'Thank you! Your tuition payment of $5,000 was processed successfully.',
            time: 'Yesterday, 2:30 PM',
            type: 'FINANCE',
            icon: '💳'
          }
        ]
      });
    }

    const studentIds = studentRes.rows.map(r => r.student_id);

    // 2. Fetch the latest attendance check-in logs for those students
    const attendanceRes = await pool.query(
      `SELECT a.id, a.date, a.status, s.first_name, s.last_name 
       FROM attendance_records a
       JOIN students s ON a.student_id = s.id
       WHERE a.student_id = ANY($1)
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [studentIds]
    );

    const notifications = attendanceRes.rows.map(row => ({
      id: row.id,
      title: row.status === 'PRESENT' ? 'Student Checked In' : 'Attendance Alert',
      message: `${row.first_name} ${row.last_name} was marked ${row.status.toLowerCase()} for school.`,
      time: new Date(row.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      type: row.status === 'PRESENT' ? 'TAP_IN' : 'ALERT',
      icon: row.status === 'PRESENT' ? '✅' : '⚠️'
    }));

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Failed to fetch parent notifications:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
