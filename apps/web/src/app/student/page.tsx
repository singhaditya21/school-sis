import { redirect } from 'next/navigation';
import { BookOpen, CalendarDays, UserRound } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { pool } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StudentProfile = {
    name: string;
    admissionNumber: string | null;
    gradeName: string | null;
    sectionName: string | null;
};

export default async function StudentHomePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');
    if (session.role !== 'STUDENT') redirect('/unauthorized');

    const { rows } = await pool.query<StudentProfile>(
        `SELECT
            TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS name,
            s.admission_number AS "admissionNumber",
            g.name AS "gradeName",
            sec.name AS "sectionName"
         FROM students s
         LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         WHERE s.user_id = $1 AND s.tenant_id = $2
         LIMIT 1`,
        [session.userId, session.tenantId],
    );
    const profile = rows[0];

    if (!profile) {
        return (
            <div className="mx-auto max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Student profile not linked</CardTitle>
                        <CardDescription>
                            Your account is authenticated, but it is not linked to a student record in this tenant.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            Ask your school administrator to link the account before academic information can be displayed.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const academicContext = [profile.gradeName, profile.sectionName].filter(Boolean).join(' — ');

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <p className="text-sm font-medium text-primary">Signed-in student record</p>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">Welcome, {profile.name}</h1>
                <p className="mt-2 text-muted-foreground">
                    This page shows only information linked to your authenticated tenant account.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <UserRound className="h-5 w-5 text-primary" aria-hidden="true" />
                        <CardDescription>Admission number</CardDescription>
                    </CardHeader>
                    <CardContent className="font-mono font-semibold">
                        {profile.admissionNumber || 'Not provided'}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                        <CardDescription>Academic placement</CardDescription>
                    </CardHeader>
                    <CardContent className="font-semibold">
                        {academicContext || 'Not provided'}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                        <CardDescription>Assignments</CardDescription>
                    </CardHeader>
                    <CardContent className="font-semibold">Unavailable</CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Academic workspace</CardTitle>
                    <CardDescription>
                        Assignment and course surfaces remain unavailable until they are backed by session-owned records and tested mutations.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}
