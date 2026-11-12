import Link from 'next/link';
import { Award, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { sqlFor, withTenant } from '@/lib/db';
import {
    BOARD_PRESETS,
    computeBoardGrade,
    verifyReportCardVerificationToken,
} from '@/lib/academics/board-grading';
import { deriveShortVerificationCode } from '@/lib/security/gate-pass-token';
import { VerificationQrSeal } from '@/components/security/verification-qr-seal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Verify Official Academic Transcript | ScholarMind',
};

export default async function VerifyReportCardPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const verified = verifyReportCardVerificationToken(token);

    if (verified.ok === false) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background p-6">
                <Card className="w-full max-w-xl border-destructive/30 shadow-lg overflow-hidden">
                    <div className="h-1.5 w-full bg-destructive" />
                    <CardHeader className="space-y-2">
                        <div className="flex items-center gap-2 text-destructive">
                            <ShieldAlert className="h-5 w-5" />
                            <Badge variant="destructive">Unverified Transcript Seal</Badge>
                        </div>
                        <CardTitle className="text-2xl">Transcript Verification Failed</CardTitle>
                        <CardDescription>{verified.reason}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link
                            href="/login"
                            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                            Sign in to School Portal →
                        </Link>
                    </CardContent>
                </Card>
            </main>
        );
    }

    const transcript = await withTenant(verified.tenantId, async (client) => {
        const q = sqlFor(client);
        const header = await q<{
            firstName: string;
            lastName: string;
            admissionNumber: string;
            gradeId: string;
            gradeName: string | null;
            sectionName: string | null;
            schoolName: string;
            affiliationBoard: string | null;
            udiseCode: string | null;
            examName: string;
            examStatus: string;
            academicYearName: string;
        }>`
            SELECT
                s.first_name AS "firstName",
                s.last_name AS "lastName",
                s.admission_number AS "admissionNumber",
                s.grade_id AS "gradeId",
                g.name AS "gradeName",
                sec.name AS "sectionName",
                t.name AS "schoolName",
                t.affiliation_board AS "affiliationBoard",
                t.udise_code AS "udiseCode",
                e.name AS "examName",
                e.status AS "examStatus",
                ay.name AS "academicYearName"
            FROM students s
            JOIN tenants t ON t.id = s.tenant_id
            JOIN exams e ON e.id = ${verified.examId} AND e.tenant_id = s.tenant_id
            JOIN academic_years ay ON ay.id = e.academic_year_id AND ay.tenant_id = s.tenant_id
            LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
            LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
            WHERE s.id = ${verified.studentId}
              AND s.tenant_id = ${verified.tenantId}
              AND e.status = 'PUBLISHED'
            LIMIT 1
        `.maybeOne();

        if (!header) return null;

        const rows = await q<{
            subjectName: string;
            subjectCode: string | null;
            maxMarks: string;
            passingMarks: string;
            marksObtained: string | null;
            isAbsent: boolean | null;
        }>`
            SELECT
                sub.name AS "subjectName",
                sub.code AS "subjectCode",
                es.max_marks AS "maxMarks",
                es.passing_marks AS "passingMarks",
                sr.marks_obtained AS "marksObtained",
                sr.is_absent AS "isAbsent"
            FROM exam_schedules es
            JOIN subjects sub ON sub.id = es.subject_id AND sub.tenant_id = ${verified.tenantId}
            LEFT JOIN student_results sr
                ON sr.exam_schedule_id = es.id
               AND sr.student_id = ${verified.studentId}
               AND sr.tenant_id = ${verified.tenantId}
            WHERE es.exam_id = ${verified.examId}
              AND es.grade_id = ${header.gradeId}
            ORDER BY es.exam_date ASC, sub.name ASC
        `;

        return { header, rows };
    });

    if (!transcript) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background p-6">
                <Card className="w-full max-w-xl border-border shadow-lg">
                    <CardHeader>
                        <Badge variant="secondary" className="w-fit mb-2">
                            Unpublished or Missing Record
                        </Badge>
                        <CardTitle className="text-2xl">Published Transcript Not Found</CardTitle>
                        <CardDescription>
                            Only officially published examination records can be verified externally.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </main>
        );
    }

    const { header, rows } = transcript;
    const preset = BOARD_PRESETS[verified.board];
    const sealCode = deriveShortVerificationCode(token, 'RC');

    let totalScored = 0;
    let totalMax = 0;
    let enteredCount = 0;
    for (const r of rows) {
        if (r.marksObtained !== null || r.isAbsent) {
            enteredCount += 1;
            const max = Number(r.maxMarks);
            const scored = r.isAbsent ? 0 : Number(r.marksObtained ?? 0);
            totalMax += max;
            totalScored += scored;
        }
    }
    const overallPct = enteredCount > 0 && totalMax > 0 ? Math.round((totalScored / totalMax) * 1000) / 10 : null;
    const overallGrade = computeBoardGrade(overallPct, verified.board, false);

    return (
        <main className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
            <Card
                data-testid="verified-report-card-seal"
                className="w-full max-w-2xl border-brass/40 shadow-xl overflow-hidden"
            >
                <div className="h-1.5 w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <CardHeader className="space-y-3 border-b border-border bg-accent/35 pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge
                            variant="outline"
                            className="border-brass/45 bg-card text-primary font-semibold gap-1.5"
                        >
                            <ShieldCheck className="h-3.5 w-3.5 text-brass" />
                            Tamper-Evident Transcript Seal ({sealCode})
                        </Badge>
                        <Badge className="bg-success text-success-foreground gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Authentic Published Record
                        </Badge>
                    </div>
                    <CardTitle className="text-2xl">{header.schoolName}</CardTitle>
                    <CardDescription>
                        {preset.fullName} · Academic Year {header.academicYearName}
                        {header.udiseCode ? ` · UDISE ${header.udiseCode}` : ''}
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-5 rounded-xl border border-brass/30 bg-accent/25 p-4">
                        <div className="space-y-1 text-center sm:text-left">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Candidate &amp; Assessment
                            </p>
                            <p className="text-lg font-bold text-foreground">
                                {header.firstName} {header.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Admission <span className="font-mono font-semibold text-foreground">{header.admissionNumber}</span>
                                {' · '}
                                {[header.gradeName, header.sectionName].filter(Boolean).join('-')}
                                {' · '}
                                {header.examName}
                            </p>
                            <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                <Badge variant="outline" className="border-brass/40 bg-card text-accent-foreground">
                                    <Award className="mr-1 h-3 w-3 text-brass" />
                                    {preset.shortLabel}: {overallGrade.grade} ({overallGrade.descriptor})
                                </Badge>
                                {overallPct !== null && (
                                    <Badge variant="secondary" className="font-mono">
                                        Aggregate: {overallPct}% ({totalScored}/{totalMax})
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <VerificationQrSeal seed={token} sizePx={104} label="Verified Report Card QR" />
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted border-b border-border">
                                <tr>
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Subject</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Marks</th>
                                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                                        {preset.shortLabel} Grade
                                    </th>
                                    <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.map((row, idx) => {
                                    const max = Number(row.maxMarks);
                                    const scored =
                                        row.marksObtained !== null ? Number(row.marksObtained) : null;
                                    const pct =
                                        scored !== null && max > 0 ? Math.round((scored / max) * 1000) / 10 : null;
                                    const bg = computeBoardGrade(pct, verified.board, Boolean(row.isAbsent));

                                    return (
                                        <tr key={idx}>
                                            <td className="px-4 py-2.5 font-medium text-foreground">
                                                {row.subjectName}
                                                {row.subjectCode ? (
                                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                                        ({row.subjectCode})
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-mono text-foreground">
                                                {row.isAbsent
                                                    ? 'AB'
                                                    : scored !== null
                                                      ? `${scored} / ${max}`
                                                      : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-semibold text-primary">
                                                {bg.grade}
                                            </td>
                                            <td className="px-4 py-2.5 text-center text-xs">
                                                <span
                                                    className={
                                                        bg.passed
                                                            ? 'font-semibold text-success'
                                                            : 'font-semibold text-destructive'
                                                    }
                                                >
                                                    {row.marksObtained === null && !row.isAbsent
                                                        ? 'Not Entered'
                                                        : bg.passed
                                                          ? 'Cleared'
                                                          : bg.descriptor}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                        Verified directly against {header.schoolName}&apos;s immutable published ledger on ScholarMind.
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
