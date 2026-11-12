import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Award, Download, ExternalLink, ShieldCheck, Stamp } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import {
    BOARD_PRESETS,
    computeBoardGrade,
    deriveHolisticAttributes,
    normalizeBoardPreset,
    signReportCardVerificationToken,
    splitWeightedMarks,
    type BoardPreset,
} from '@/lib/academics/board-grading';
import { deriveShortVerificationCode } from '@/lib/security/gate-pass-token';
import { VerificationQrSeal } from '@/components/security/verification-qr-seal';
import { Badge } from '@/components/ui/badge';
import {
    getClassReportCards,
    getDefaultExamForSection,
    getReportCardStudioPolicyAction,
} from '../../../_actions/report-cards';
import { PrintButton } from './print-button';

const PREVIEW_BOARDS: BoardPreset[] = ['CBSE', 'ICSE', 'NEP_2020_HPC', 'IB'];

export default async function StudentReportCardPage({
    params,
    searchParams,
}: {
    params: Promise<{ classId: string; studentId: string }>;
    searchParams: Promise<{ examId?: string; board?: string }>;
}) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.tenantId) redirect('/login');

    const { classId: sectionId, studentId } = await params;
    const { examId: examIdParam, board: boardParam } = await searchParams;
    const examId = examIdParam ?? (await getDefaultExamForSection(sectionId));

    const [data, policy] = await Promise.all([
        examId ? getClassReportCards(sectionId, examId) : Promise.resolve(null),
        getReportCardStudioPolicyAction(),
    ]);
    const student = data?.students.find((s) => s.studentId === studentId) ?? null;

    if (!data || !student) {
        return (
            <div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center">
                <p className="text-muted-foreground">
                    No report card found for this student in the selected exam.
                </p>
                <Link
                    href={`/exams/report-cards/${sectionId}`}
                    className="text-primary hover:underline text-sm mt-2 inline-block"
                >
                    ← Back to class
                </Link>
            </div>
        );
    }

    const activeBoard: BoardPreset = boardParam
        ? normalizeBoardPreset(boardParam)
        : policy.affiliationBoard;
    const preset = BOARD_PRESETS[activeBoard];
    const className = `${data.gradeName}-${data.sectionName}`;
    const notEntered = data.subjects.length - student.subjectsEntered;
    const overallGrade = computeBoardGrade(student.percentage, activeBoard, false);
    const holisticRows = deriveHolisticAttributes(student.percentage, activeBoard);

    const isPublished = data.examStatus === 'PUBLISHED';
    const verifyToken = isPublished
        ? signReportCardVerificationToken({
              tenantId: session.tenantId,
              studentId: student.studentId,
              examId: data.examId,
              board: activeBoard,
          })
        : null;
    const sealCode = verifyToken ? deriveShortVerificationCode(verifyToken, 'RC') : null;

    return (
        <div className="space-y-6">
            {/* Toolbar (hidden on print) */}
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <Link
                    href={`/exams/report-cards/${sectionId}?examId=${data.examId}`}
                    className="text-primary hover:underline text-sm font-medium"
                >
                    ← Back to {className}
                </Link>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-border bg-card p-1 gap-1">
                        {PREVIEW_BOARDS.map((bKey) => {
                            const active = bKey === activeBoard;
                            return (
                                <Link
                                    key={bKey}
                                    data-testid={`switch-board-${bKey.toLowerCase()}`}
                                    href={`/exams/report-cards/${sectionId}/${studentId}?examId=${data.examId}&board=${bKey}`}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                        active
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {BOARD_PRESETS[bKey].shortLabel}
                                </Link>
                            );
                        })}
                    </div>

                    {isPublished && (
                        <a
                            href={`/api/report-cards/${student.studentId}/${data.examId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brass/40 bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/80"
                        >
                            <Download className="h-3.5 w-3.5 text-brass" />
                            Official PDF
                        </a>
                    )}
                    <PrintButton />
                </div>
            </div>

            {/* Official Board-Compliant Transcript Document */}
            <div
                data-testid="board-report-card-document"
                className="bg-card rounded-2xl shadow-md border border-brass/40 overflow-hidden print:border-0 print:shadow-none"
            >
                <div className="h-1.5 w-full bg-gradient-to-r from-primary via-brass to-primary" />

                {/* Institutional Letterhead */}
                <div className="p-6 border-b border-border bg-accent/30">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className="border-brass/45 bg-card text-primary font-semibold gap-1.5"
                                >
                                    <Award className="h-3.5 w-3.5 text-brass" />
                                    {preset.shortLabel} Official Format
                                </Badge>
                                {policy.udiseCode && (
                                    <Badge variant="secondary" className="font-mono text-xs">
                                        UDISE: {policy.udiseCode}
                                    </Badge>
                                )}
                            </div>
                            <h1 className="text-2xl font-bold text-foreground pt-1">{policy.schoolName}</h1>
                            <p className="text-xs font-medium text-muted-foreground">
                                {preset.fullName} · {preset.regulator}
                            </p>
                        </div>

                        <div className="text-left sm:text-right space-y-0.5">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                                Candidate Profile
                            </p>
                            <p className="text-lg font-bold text-foreground">{student.fullName}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                                {student.admissionNumber} · {className}
                                {student.rollNumber !== null && ` · Roll ${student.rollNumber}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {data.examName} · {data.academicYearName}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Part I — Scholastic Assessment & Board Weightages */}
                <div className="px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                        Part I · Scholastic Attainment
                    </h2>
                    <span className="text-xs text-muted-foreground">{preset.weightageSummary}</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted border-y border-border">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Weighted Split
                                </th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Marks</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Max</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    {preset.shortLabel} Grade
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.subjects.map((subject) => {
                                const mark = student.subjectMarks[subject.scheduleId];
                                const pct =
                                    mark && !mark.isAbsent && mark.marksObtained !== null && subject.maxMarks > 0
                                        ? Math.round((mark.marksObtained / subject.maxMarks) * 1000) / 10
                                        : null;
                                const bg = computeBoardGrade(pct, activeBoard, Boolean(mark?.isAbsent));
                                const split = splitWeightedMarks(
                                    mark?.isAbsent ? null : (mark?.marksObtained ?? null),
                                    subject.maxMarks,
                                    activeBoard,
                                );

                                return (
                                    <tr key={subject.scheduleId}>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-foreground">{subject.subjectName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {subject.subjectCode} · {formatDate(subject.examDate)}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-muted-foreground">
                                            {!mark || mark.isAbsent || mark.marksObtained === null
                                                ? '—'
                                                : split.map((c) => `${c.label.split(' ')[0]}: ${c.scored}/${c.max}`).join(' · ')}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                                            {!mark ? '—' : mark.isAbsent ? 'AB' : (mark.marksObtained ?? '—')}
                                        </td>
                                        <td className="px-4 py-3 text-right text-muted-foreground font-mono">
                                            {subject.maxMarks}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-primary">
                                            {!mark ? '—' : bg.grade}
                                            {mark && bg.gradePoint !== null && !mark.isAbsent && (
                                                <span className="block text-[10px] font-normal text-muted-foreground">
                                                    GP {bg.gradePoint.toFixed(1)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {!mark ? (
                                                <span className="text-muted-foreground text-xs">Not entered</span>
                                            ) : mark.isAbsent ? (
                                                <span className="text-destructive text-xs font-semibold">Absent</span>
                                            ) : (mark.marksObtained ?? 0) >= subject.passingMarks ? (
                                                <span className="text-success text-xs font-semibold">Pass</span>
                                            ) : (
                                                <span className="text-destructive text-xs font-semibold">Fail</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Aggregate Summary */}
                <div className="p-6 border-t border-border bg-muted/25 grid grid-cols-2 md:grid-cols-6 gap-4">
                    <Field label="Total Marks" value={`${student.totalObtained} / ${student.totalMax}`} />
                    <Field
                        label="Aggregate %"
                        value={student.percentage === null ? '—' : `${student.percentage}%`}
                    />
                    <Field
                        label={`${preset.shortLabel} Band`}
                        value={`${overallGrade.grade} (${overallGrade.descriptor})`}
                    />
                    <Field
                        label="Papers Cleared"
                        value={`${student.subjectsPassed}/${student.subjectsEntered}`}
                    />
                    <Field
                        label="Section Rank"
                        value={student.sectionRank === null ? '—' : `#${student.sectionRank}`}
                    />
                    <Field
                        label={`Class Rank (of ${data.gradeStudentCount})`}
                        value={student.classRank === null ? '—' : `#${student.classRank}`}
                    />
                </div>

                {/* Part II — Co-Scholastic & Holistic Learner Attributes */}
                {policy.showCoScholastic && (
                    <div className="px-6 py-5 border-t border-border space-y-3">
                        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                            Part II · Co-Scholastic &amp; Holistic Dispositions
                        </h2>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {holisticRows.map((item) => (
                                <div
                                    key={item.domain}
                                    className="rounded-xl border border-border bg-accent/25 p-3.5 flex items-start justify-between gap-3"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{item.domain}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.descriptor}</p>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className="border-brass/40 bg-card text-primary font-bold shrink-0"
                                    >
                                        {item.gradeBand}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {notEntered > 0 && (
                    <div className="px-6 pb-4">
                        <p className="text-xs text-muted-foreground">
                            {notEntered} scheduled paper(s) have no saved result yet and are excluded
                            from the total and percentage.
                        </p>
                    </div>
                )}

                {data.subjects.some((s) => Boolean(student.subjectMarks[s.scheduleId]?.remarks)) && (
                    <div className="px-6 pb-5">
                        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-primary mb-2">
                            Faculty Remarks
                        </h2>
                        <ul className="space-y-1">
                            {data.subjects.map((subject) => {
                                const remark = student.subjectMarks[subject.scheduleId]?.remarks;
                                if (!remark) return null;
                                return (
                                    <li key={subject.scheduleId} className="text-sm text-foreground">
                                        <span className="font-semibold">{subject.subjectName}:</span> {remark}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Official Signatures & Cryptographic Tamper-Evident QR Seal */}
                <div className="p-6 border-t border-brass/35 bg-accent/35 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="grid grid-cols-2 gap-8 flex-1">
                        <div className="border-t border-border pt-2.5">
                            <p className="text-xs font-semibold text-foreground">Class Teacher</p>
                            <p className="text-[11px] text-muted-foreground">Academic Register Verified</p>
                        </div>
                        <div className="border-t border-brass/50 pt-2.5">
                            <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                                <Stamp className="h-3.5 w-3.5 text-brass" />
                                {policy.principalName}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Digitally Countersigned · {policy.schoolName}
                            </p>
                        </div>
                    </div>

                    {verifyToken && sealCode ? (
                        <div className="flex items-center gap-4 rounded-xl border border-brass/40 bg-card p-3">
                            <VerificationQrSeal
                                seed={verifyToken}
                                sizePx={86}
                                label={`Transcript Verification QR (${sealCode})`}
                            />
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 text-xs font-bold text-primary">
                                    <ShieldCheck className="h-3.5 w-3.5 text-brass" />
                                    {sealCode}
                                </div>
                                <p className="text-[11px] text-muted-foreground max-w-[170px]">
                                    HMAC-SHA256 tamper-evident transcript verification seal.
                                </p>
                                <Link
                                    href={`/verify/report-card/${verifyToken}`}
                                    data-testid="open-report-card-verification"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline print:hidden"
                                >
                                    Verify Seal
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <Badge variant="outline">Draft Exam — Publish to Mint QR Seal</Badge>
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-base font-bold text-foreground mt-0.5">{value}</p>
        </div>
    );
}
