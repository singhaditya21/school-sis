import Link from 'next/link';
import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { sqlFor, withTenant } from '@/lib/db';
import {
    deriveShortVerificationCode,
    verifyGatePassToken,
} from '@/lib/security/gate-pass-token';
import { VerificationQrSeal } from '@/components/security/verification-qr-seal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Verify Campus Dismissal Gate Pass | ScholarMind',
};

function maskName(firstName: string, lastName: string): string {
    const first = firstName.trim();
    const last = lastName.trim();
    return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export default async function VerifyGatePassPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const verified = verifyGatePassToken(token);

    if (verified.ok === false) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background p-6">
                <Card className="w-full max-w-lg border-destructive/30 shadow-lg overflow-hidden">
                    <div className="h-1.5 w-full bg-destructive" />
                    <CardHeader className="space-y-2">
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-5 w-5" />
                            <Badge variant="destructive">Do Not Release — Invalid Pass</Badge>
                        </div>
                        <CardTitle className="text-2xl">Gate Pass Verification Failed</CardTitle>
                        <CardDescription>{verified.reason}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link
                            href="/login"
                            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                            Sign in to School / Parent Portal →
                        </Link>
                    </CardContent>
                </Card>
            </main>
        );
    }

    const record = await withTenant(verified.tenantId, async (client) => {
        const q = sqlFor(client);
        return q<{
            studentFirstName: string;
            studentLastName: string;
            admissionNumber: string;
            studentStatus: string;
            gradeName: string | null;
            sectionName: string | null;
            guardianFirstName: string;
            guardianLastName: string;
            relation: string;
            schoolName: string;
            routeName: string | null;
        }>`
            SELECT
                s.first_name AS "studentFirstName",
                s.last_name AS "studentLastName",
                s.admission_number AS "admissionNumber",
                s.status::text AS "studentStatus",
                g.name AS "gradeName",
                sec.name AS "sectionName",
                gd.first_name AS "guardianFirstName",
                gd.last_name AS "guardianLastName",
                gd.relation::text AS "relation",
                t.name AS "schoolName",
                (
                    SELECT r.name
                    FROM student_transport st
                    JOIN routes r ON r.id = st.route_id AND r.tenant_id = st.tenant_id
                    WHERE st.student_id = s.id AND st.tenant_id = s.tenant_id
                    ORDER BY st.start_date DESC NULLS LAST
                    LIMIT 1
                ) AS "routeName"
            FROM students s
            JOIN guardians gd ON gd.student_id = s.id AND gd.tenant_id = s.tenant_id
            JOIN tenants t ON t.id = s.tenant_id
            LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
            LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
            WHERE s.id = ${verified.studentId}
              AND gd.user_id = ${verified.guardianUserId}
              AND s.tenant_id = ${verified.tenantId}
            LIMIT 1
        `.maybeOne();
    });

    if (!record || record.studentStatus !== 'ACTIVE') {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background p-6">
                <Card className="w-full max-w-lg border-border shadow-lg">
                    <CardHeader>
                        <Badge variant="destructive" className="w-fit mb-2">
                            Guardian Link Inactive
                        </Badge>
                        <CardTitle className="text-2xl">Dismissal Record Not Found</CardTitle>
                        <CardDescription>
                            This student or guardian authorization is no longer active. Please direct the guardian to the reception desk.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </main>
        );
    }

    const deskCode = deriveShortVerificationCode(token, 'GP');

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
            <Card
                data-testid="verified-gate-pass-card"
                className="w-full max-w-lg border-brass/40 shadow-xl overflow-hidden"
            >
                <div className="h-1.5 w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <CardHeader className="space-y-3 border-b border-border bg-accent/35 pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge
                            variant="outline"
                            className="border-brass/45 bg-card text-primary font-semibold gap-1.5"
                        >
                            <ShieldCheck className="h-3.5 w-3.5 text-brass" />
                            HMAC-SHA256 Verified Gate Pass
                        </Badge>
                        <Badge className="bg-success text-success-foreground gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Authorized Pickup
                        </Badge>
                    </div>
                    <CardTitle className="text-2xl">{record.schoolName}</CardTitle>
                    <CardDescription>
                        Verified guardian campus dismissal credential — valid for security gate release.
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                    <div className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-brass/30 bg-accent/25 p-4">
                        <VerificationQrSeal seed={token} sizePx={112} label="Verified Gate Pass QR" />
                        <div className="text-center sm:text-left space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Gate Desk Verification Code
                            </p>
                            <p
                                data-testid="gate-pass-desk-code"
                                className="font-mono text-2xl font-bold tracking-wider text-primary"
                            >
                                {deskCode}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Valid Date: <span className="font-semibold text-foreground">{verified.validDate}</span>
                            </p>
                        </div>
                    </div>

                    <dl className="rounded-xl border border-border bg-muted/45 p-4 space-y-2.5 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Student</dt>
                            <dd className="font-semibold text-foreground">
                                {maskName(record.studentFirstName, record.studentLastName)}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Class &amp; Admission</dt>
                            <dd className="font-mono text-foreground">
                                {[record.gradeName, record.sectionName].filter(Boolean).join('-')} · {record.admissionNumber}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Authorized Guardian</dt>
                            <dd className="font-semibold text-foreground">
                                {maskName(record.guardianFirstName, record.guardianLastName)} ({record.relation})
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Assigned Transport</dt>
                            <dd className="text-right text-foreground">
                                {record.routeName ?? 'Guardian Direct Pickup'}
                            </dd>
                        </div>
                    </dl>

                    <p className="text-center text-xs text-muted-foreground">
                        Cryptographically signed by ScholarMind Campus Security ·{' '}
                        <Link href="/login" className="underline hover:text-foreground">
                            Staff Sign In
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
