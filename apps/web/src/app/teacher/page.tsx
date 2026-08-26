import { redirect } from 'next/navigation';

/**
 * The teacher portal had no root page, so /teacher — the "Dashboard" entry in
 * its own sidebar — was a 404. Today's schedule is the most useful landing
 * point and the most complete screen in this portal.
 */
export default function TeacherHome() {
    redirect('/teacher/schedule');
}
