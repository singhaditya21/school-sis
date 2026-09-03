import Link from 'next/link';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

/**
 * Regulatory compliance readout.
 *
 * This page reports only what the data model actually records. Where a
 * regulatory obligation has no supporting table, column or integration, the
 * section says so in plain words instead of showing a status it cannot justify.
 *
 * Backing data:
 *   - tenants.udise_code / affiliation_* / postal fields  → institution profile
 *   - students.aadhaar_number / apaar_id / category / …   → record completeness
 *   - staff_profiles.aadhaar_number / pan_number / …      → staff completeness
 *   - consent_forms + consent_responses                   → consent register
 *   - exam_proctoring_logs                                → proctoring log
 */

interface TenantRow {
    name: string;
    udise_code: string | null;
    affiliation_board: string | null;
    affiliation_number: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
}

interface StudentCoverageRow {
    active: number;
    no_aadhaar: number;
    no_apaar: number;
    no_category: number;
    no_address: number;
    no_guardian: number;
}

interface StaffCoverageRow {
    active: number;
    no_aadhaar: number;
    no_pan: number;
    no_qualification: number;
}

interface ConsentRow {
    active_forms: number;
    total_forms: number;
    accepted: number;
    declined: number;
    students_with_response: number;
}

interface ProctoringRow {
    id: string;
    student_name: string;
    exam_name: string;
    subject_name: string;
    flag_type: string;
    description: string | null;
    logged_at: Date;
}

export default async function CompliancePage() {
    const { tenantId } = await requireAuth('audit:read');

    const [tenantResult, studentResult, staffResult, consentResult, proctoringResult] =
        await Promise.all([
            pool.query<TenantRow>(
                `SELECT name, udise_code, affiliation_board, affiliation_number,
                        address, city, state, pincode, phone, email
                   FROM tenants
                  WHERE id = $1`,
                [tenantId],
            ),
            pool.query<StudentCoverageRow>(
                `SELECT count(*)::int AS active,
                        count(*) FILTER (WHERE COALESCE(s.aadhaar_number_enc, s.aadhaar_number) IS NULL OR btrim(COALESCE(s.aadhaar_number_enc, s.aadhaar_number)) = '')::int AS no_aadhaar,
                        count(*) FILTER (WHERE COALESCE(s.apaar_id_enc, s.apaar_id) IS NULL OR btrim(COALESCE(s.apaar_id_enc, s.apaar_id)) = '')::int AS no_apaar,
                        count(*) FILTER (WHERE s.category IS NULL OR btrim(s.category) = '')::int AS no_category,
                        count(*) FILTER (WHERE s.address IS NULL OR s.city IS NULL OR s.state IS NULL OR s.pincode IS NULL)::int AS no_address,
                        count(*) FILTER (
                            WHERE NOT EXISTS (
                                SELECT 1 FROM guardians g
                                 WHERE g.student_id = s.id AND g.tenant_id = s.tenant_id
                            )
                        )::int AS no_guardian
                   FROM students s
                  WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'`,
                [tenantId],
            ),
            pool.query<StaffCoverageRow>(
                `SELECT count(*)::int AS active,
                        count(*) FILTER (WHERE COALESCE(aadhaar_number_enc, aadhaar_number) IS NULL OR btrim(COALESCE(aadhaar_number_enc, aadhaar_number)) = '')::int AS no_aadhaar,
                        count(*) FILTER (WHERE pan_number IS NULL OR btrim(pan_number) = '')::int AS no_pan,
                        count(*) FILTER (WHERE qualification IS NULL OR btrim(qualification) = '')::int AS no_qualification
                   FROM staff_profiles
                  WHERE tenant_id = $1 AND status = 'ACTIVE'`,
                [tenantId],
            ),
            pool.query<ConsentRow>(
                `SELECT (SELECT count(*)::int FROM consent_forms WHERE tenant_id = $1 AND is_active) AS active_forms,
                        (SELECT count(*)::int FROM consent_forms WHERE tenant_id = $1) AS total_forms,
                        (SELECT count(*)::int FROM consent_responses WHERE tenant_id = $1 AND response = 'ACCEPTED') AS accepted,
                        (SELECT count(*)::int FROM consent_responses WHERE tenant_id = $1 AND response = 'DECLINED') AS declined,
                        (SELECT count(DISTINCT student_id)::int FROM consent_responses WHERE tenant_id = $1) AS students_with_response`,
                [tenantId],
            ),
            pool.query<ProctoringRow>(
                `SELECT epl.id,
                        (s.first_name || ' ' || s.last_name) AS student_name,
                        e.name AS exam_name,
                        sub.name AS subject_name,
                        epl.flag_type,
                        epl.description,
                        epl.timestamp AS logged_at
                   FROM exam_proctoring_logs epl
                   JOIN students s ON s.id = epl.student_id
                   JOIN exam_schedules es ON es.id = epl.exam_schedule_id
                   JOIN exams e ON e.id = es.exam_id
                   JOIN subjects sub ON sub.id = es.subject_id
                  WHERE epl.tenant_id = $1
                  ORDER BY epl.timestamp DESC
                  LIMIT 50`,
                [tenantId],
            ),
        ]);

    const tenant = tenantResult.rows[0];
    const students = studentResult.rows[0] ?? {
        active: 0, no_aadhaar: 0, no_apaar: 0, no_category: 0, no_address: 0, no_guardian: 0,
    };
    const staff = staffResult.rows[0] ?? { active: 0, no_aadhaar: 0, no_pan: 0, no_qualification: 0 };
    const consent = consentResult.rows[0] ?? {
        active_forms: 0, total_forms: 0, accepted: 0, declined: 0, students_with_response: 0,
    };

    const profileFields: Array<{ label: string; value: string | null }> = tenant
        ? [
              { label: 'UDISE+ code', value: tenant.udise_code },
              { label: 'Affiliation board', value: tenant.affiliation_board },
              { label: 'Affiliation number', value: tenant.affiliation_number },
              { label: 'Address', value: tenant.address },
              { label: 'City', value: tenant.city },
              { label: 'State', value: tenant.state },
              { label: 'PIN code', value: tenant.pincode },
              { label: 'Phone', value: tenant.phone },
              { label: 'Email', value: tenant.email },
          ]
        : [];
    const profileMissing = profileFields.filter((field) => !field.value?.trim()).length;

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold text-foreground">Regulatory compliance</h1>
                <p className="mt-1 max-w-3xl text-muted-foreground">
                    What ScholarMind can actually evidence about UDISE+, APAAR and the DPDP Act 2023 for{' '}
                    {tenant?.name ?? 'this school'}. Sections that a regulator would expect but that this
                    release does not implement are marked as such rather than shown with a status.
                </p>
            </header>

            {/* ── Institution profile ─────────────────────────────── */}
            <Section
                title="Institution profile"
                subtitle="Fields a UDISE+ return draws from the school record."
            >
                {!tenant ? (
                    <Note>The school record could not be read.</Note>
                ) : (
                    <>
                        <p className="mb-3 text-sm text-muted-foreground">
                            {profileMissing === 0
                                ? 'All nine profile fields tracked on the school record are filled in.'
                                : `${profileMissing} of ${profileFields.length} profile fields are empty.`}
                        </p>
                        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">
                            {profileFields.map((field) => (
                                <div key={field.label} className="bg-card p-3">
                                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {field.label}
                                    </dt>
                                    <dd
                                        className={`mt-0.5 text-sm ${
                                            field.value?.trim() ? 'text-foreground' : 'italic text-red-600'
                                        }`}
                                    >
                                        {field.value?.trim() || 'Not recorded'}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </>
                )}
                <Note>
                    ScholarMind does not generate, validate or submit the UDISE+ return file in this
                    release. There is no UDISE+ export and no connection to the UDISE+ platform — the
                    figures above describe the completeness of the underlying data only.
                </Note>
            </Section>

            {/* ── Student record completeness ─────────────────────── */}
            <Section
                title="Student record completeness"
                subtitle={`${students.active.toLocaleString('en-IN')} active student record${
                    students.active === 1 ? '' : 's'
                }. Each figure counts records missing that field.`}
            >
                {students.active === 0 ? (
                    <EmptyState message="There are no active student records to check." />
                ) : (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                        <Gap label="No Aadhaar number" missing={students.no_aadhaar} total={students.active} />
                        <Gap label="No APAAR ID" missing={students.no_apaar} total={students.active} />
                        <Gap label="No social category" missing={students.no_category} total={students.active} />
                        <Gap label="Incomplete address" missing={students.no_address} total={students.active} />
                        <Gap label="No guardian on file" missing={students.no_guardian} total={students.active} />
                    </div>
                )}
                <div className="mt-3">
                    <Link href="/students" className="text-sm font-medium text-primary hover:underline">
                        Open the student register to fill these in →
                    </Link>
                </div>
            </Section>

            {/* ── APAAR ───────────────────────────────────────────── */}
            <Section
                title="APAAR"
                subtitle="Automated Permanent Academic Account Registry identifiers held on student records."
            >
                {students.active === 0 ? (
                    <EmptyState message="There are no active student records to check." />
                ) : (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        <Metric
                            label="APAAR ID recorded"
                            value={(students.active - students.no_apaar).toLocaleString('en-IN')}
                            hint={`of ${students.active.toLocaleString('en-IN')} active students`}
                        />
                        <Metric
                            label="APAAR ID missing"
                            value={students.no_apaar.toLocaleString('en-IN')}
                            hint="stored as null or blank"
                        />
                        <Metric
                            label="Coverage"
                            value={`${Math.round(
                                ((students.active - students.no_apaar) / students.active) * 100,
                            )}%`}
                            hint="recorded / active"
                        />
                    </div>
                )}
                <Note>
                    APAAR IDs are stored on the student record when someone enters them. This release has no
                    connection to the Ministry of Education APAAR service, so nothing here issues, verifies or
                    reconciles an ID, and a recorded value is not evidence that the ID is valid.
                </Note>
            </Section>

            {/* ── Staff record completeness ───────────────────────── */}
            <Section
                title="Staff record completeness"
                subtitle={`${staff.active.toLocaleString('en-IN')} active staff record${
                    staff.active === 1 ? '' : 's'
                }.`}
            >
                {staff.active === 0 ? (
                    <EmptyState message="There are no active staff records to check." />
                ) : (
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        <Gap label="No Aadhaar number" missing={staff.no_aadhaar} total={staff.active} />
                        <Gap label="No PAN" missing={staff.no_pan} total={staff.active} />
                        <Gap label="No qualification" missing={staff.no_qualification} total={staff.active} />
                    </div>
                )}
            </Section>

            {/* ── DPDPA ───────────────────────────────────────────── */}
            <Section
                title="DPDP Act 2023"
                subtitle="Consent is the only DPDPA obligation this release keeps a register for."
            >
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Metric
                        label="Consent forms"
                        value={consent.total_forms.toLocaleString('en-IN')}
                        hint={`${consent.active_forms.toLocaleString('en-IN')} currently active`}
                    />
                    <Metric label="Accepted responses" value={consent.accepted.toLocaleString('en-IN')} hint="response = ACCEPTED" />
                    <Metric label="Declined responses" value={consent.declined.toLocaleString('en-IN')} hint="response = DECLINED" />
                    <Metric
                        label="Students who responded"
                        value={consent.students_with_response.toLocaleString('en-IN')}
                        hint={`of ${students.active.toLocaleString('en-IN')} active students`}
                    />
                </div>
                {consent.total_forms === 0 && (
                    <div className="mt-3">
                        <EmptyState message="No consent forms have been created, so there is nothing to report on yet." />
                    </div>
                )}
                <Note>
                    <span className="font-semibold">Not implemented in this release.</span> There is no
                    register of data-principal requests in the data model — no table records access,
                    correction, erasure or grievance requests, or when they were answered. This screen
                    therefore cannot report request volumes, breach notifications or statutory response
                    times, and no figure on it should be presented as evidence of meeting a DPDPA deadline.
                </Note>
            </Section>

            {/* ── Proctoring ──────────────────────────────────────── */}
            <Section
                title="Online exam proctoring log"
                subtitle="Anomalies recorded against online exam sittings, newest first (up to 50)."
            >
                {proctoringResult.rows.length === 0 ? (
                    <EmptyState message="No proctoring anomalies have been recorded." />
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-border bg-card">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Student</th>
                                    <th className="px-4 py-3 font-semibold">Exam</th>
                                    <th className="px-4 py-3 font-semibold">Flag</th>
                                    <th className="px-4 py-3 font-semibold">Description</th>
                                    <th className="px-4 py-3 font-semibold">Recorded</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {proctoringResult.rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-muted/70">
                                        <td className="px-4 py-3 font-medium text-foreground">{row.student_name}</td>
                                        <td className="px-4 py-3 text-foreground">
                                            {row.exam_name}
                                            <div className="text-xs text-muted-foreground">{row.subject_name}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                                                {row.flag_type}
                                            </span>
                                        </td>
                                        <td className="max-w-sm px-4 py-3 text-foreground">
                                            {row.description ?? <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                                            {new Date(row.logged_at).toLocaleString('en-IN', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            <p className="text-sm text-muted-foreground">
                Individual actions taken by staff are recorded separately in the{' '}
                <Link href="/audit" className="font-medium text-primary hover:underline">
                    audit log
                </Link>
                .
            </p>
        </div>
    );
}

function Section({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
}) {
    return (
        <section className="space-y-3">
            <div>
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
        </section>
    );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
    );
}

function Gap({ label, missing, total }: { label: string; missing: number; total: number }) {
    const complete = missing === 0;
    return (
        <div
            className={`rounded-xl border p-4 ${
                complete ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
            }`}
        >
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div
                className={`mt-1 text-2xl font-bold ${complete ? 'text-emerald-700' : 'text-amber-800'}`}
            >
                {missing.toLocaleString('en-IN')}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
                {complete ? 'none missing' : `of ${total.toLocaleString('en-IN')} records`}
            </div>
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {children}
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
            {message}
        </div>
    );
}
