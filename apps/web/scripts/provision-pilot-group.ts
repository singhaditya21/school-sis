/**
 * Provision a pilot school group.
 *
 * Creates one company (the trust) and one tenant per branch, then fills each
 * branch with a realistic Indian school population: staff, students, guardians,
 * a fee plan, invoices and payments.
 *
 * ─── THE DATA IS SYNTHETIC AND MUST STAY OBVIOUSLY SO ───────────────────────
 *
 * The branch names and addresses are real — they are taken from the trust's own
 * public listing — but no person in here exists. Every safeguard below is there
 * so that nobody, months from now, mistakes this for a roll of real children:
 *
 *   - every tenant code ends in `-pilot`
 *   - every email address is on a `.invalid` domain, which RFC 2606 reserves so
 *     it can never resolve or receive mail
 *   - every phone number uses a fixed non-assignable prefix
 *   - every account is locked: the password hash covers a random secret that is
 *     generated per run and never stored, so none of them can be signed into
 *   - every student carries `custom_data.pilot = true`, so the whole cohort is
 *     one query away from being identified or removed
 *
 * Names are drawn from common Indian given and family names so the data reads
 * correctly in the UI — realistic in shape, not traceable to anyone.
 *
 * Deterministic: the same run produces the same population, so a re-run is a
 * no-op rather than a second cohort. Idempotent on tenant code and on the
 * company name.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/provision-pilot-group.ts
 *   pnpm --filter @school-sis/web exec tsx scripts/provision-pilot-group.ts --students 200
 *   pnpm --filter @school-sis/web exec tsx scripts/provision-pilot-group.ts --dry-run
 *
 * Creates NO administrator accounts. Those carry passwords and must be created
 * through /setup, which also enrols them in two-factor.
 */

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

// ─── The group ──────────────────────────────────────────────────────────────

const COMPANY_NAME = 'The Society for the Advancement of Education';

interface Branch {
    name: string;
    code: string;
    /**
     * Short branch tag for admission, invoice and receipt numbers. Explicit
     * rather than derived: slicing the code gave every branch "CAM", so a
     * document number said nothing about which school issued it.
     */
    abbr: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
}

/** Addresses as published by the trust. Codes carry a `-pilot` suffix. */
const BRANCHES: Branch[] = [
    {
        name: 'Cambridge School, Swami Pranavananda Marg',
        code: 'cambridge-spm-pilot',
        abbr: 'CSPM',
        address: 'Swami Pranavananda Marg, Ring Road',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110065',
    },
    {
        name: 'Cambridge School, New Friends Colony',
        code: 'cambridge-nfc-pilot',
        abbr: 'CNFC',
        address: 'A-Block, New Friends Colony',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110025',
    },
    {
        name: 'Cambridge School, Indirapuram',
        code: 'cambridge-indirapuram-pilot',
        abbr: 'CIND',
        address: 'Shakti Khand II, Indirapuram',
        city: 'Ghaziabad',
        state: 'Uttar Pradesh',
        pincode: '201014',
    },
    {
        name: 'Cambridge School, Noida',
        code: 'cambridge-noida-pilot',
        abbr: 'CNOI',
        address: 'Sector-27, Noida',
        city: 'Gautam Buddh Nagar',
        state: 'Uttar Pradesh',
        pincode: '201301',
    },
    {
        name: 'Cambridge School, Greater Noida',
        code: 'cambridge-greater-noida-pilot',
        abbr: 'CGNO',
        address: '1-B, Institutional Area, Knowledge Park I',
        city: 'Greater Noida',
        state: 'Uttar Pradesh',
        pincode: '201310',
    },
];

// ─── Name pools ─────────────────────────────────────────────────────────────

const BOY_NAMES = [
    'Aarav', 'Vivaan', 'Aditya', 'Ishaan', 'Arjun', 'Reyansh', 'Vihaan', 'Sai',
    'Krishna', 'Dhruv', 'Atharva', 'Kabir', 'Ayaan', 'Rudra', 'Shaurya', 'Advait',
    'Yuvan', 'Neel', 'Ranveer', 'Ansh', 'Kian', 'Ved', 'Aryan', 'Parth',
];
const GIRL_NAMES = [
    'Ananya', 'Diya', 'Kavya', 'Saanvi', 'Prisha', 'Myra', 'Kiara', 'Navya',
    'Riya', 'Aadhya', 'Anika', 'Ira', 'Sara', 'Meera', 'Tara', 'Ishita',
    'Avni', 'Nitara', 'Siya', 'Pari', 'Aarohi', 'Mahika', 'Vanya', 'Zara',
];
const SURNAMES = [
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Rao',
    'Nair', 'Menon', 'Agarwal', 'Jain', 'Chopra', 'Malhotra', 'Kapoor', 'Mehta',
    'Shah', 'Desai', 'Joshi', 'Kulkarni', 'Bhatia', 'Khanna', 'Sethi', 'Bansal',
    'Chauhan', 'Yadav', 'Mishra', 'Tiwari', 'Pandey', 'Saxena',
];
const FATHER_NAMES = [
    'Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Vinod', 'Anil', 'Amit', 'Vivek',
    'Sanjay', 'Deepak', 'Manoj', 'Rakesh', 'Ashok', 'Pankaj', 'Sunil',
];
const MOTHER_NAMES = [
    'Sunita', 'Anita', 'Kavita', 'Rekha', 'Meena', 'Neha', 'Pooja', 'Swati',
    'Priti', 'Geeta', 'Shalini', 'Anjali', 'Ritu', 'Nisha', 'Preeti',
];
const OCCUPATIONS = [
    'Engineer', 'Doctor', 'Business', 'Teacher', 'Lawyer', 'Architect',
    'Chartered Accountant', 'Civil Servant', 'Banker', 'Consultant',
];

/** Class teachers and heads of department, one pool per branch. */
const STAFF_ROLES = [
    { role: 'PRINCIPAL', count: 1 },
    { role: 'ACCOUNTANT', count: 1 },
    { role: 'REGISTRAR', count: 1 },
    { role: 'TEACHER', count: 8 },
] as const;

const SUBJECTS = [
    { name: 'English', code: 'ENG' },
    { name: 'Hindi', code: 'HIN' },
    { name: 'Mathematics', code: 'MATH' },
    { name: 'Science', code: 'SCI' },
    { name: 'Social Science', code: 'SST' },
    { name: 'Computer Science', code: 'CS' },
    { name: 'Physical Education', code: 'PE' },
];

const GRADE_NAMES = [
    'Pre-Primary', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
];
const SECTION_NAMES = ['A', 'B', 'C'];

// ─── Deterministic pseudo-randomness ────────────────────────────────────────

/**
 * A seeded generator, so a given branch always produces the same population.
 * Math.random() would mean a re-run created a second, different cohort rather
 * than being the no-op the idempotency checks assume.
 */
function makeRandom(seed: string): () => number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h += 0x6d2b79f5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = <T>(rng: () => number, items: readonly T[]): T =>
    items[Math.floor(rng() * items.length)];

/**
 * `.invalid` is reserved by RFC 2606 and can never resolve, so nothing here can
 * ever reach a real inbox even if mail is wired up later.
 */
const pilotEmail = (local: string, branchCode: string): string =>
    `${local}.${branchCode}@pilot.invalid`.toLowerCase().replace(/[^a-z0-9.@-]/g, '');

/**
 * A fixed non-assignable prefix. Indian mobile numbers begin 6-9 and every such
 * range is allocated, so a "realistic" number risks belonging to a real person
 * the moment anyone wires an SMS provider. These are deliberately not dialable.
 */
const pilotPhone = (n: number): string => `+91-00000-${String(n % 100000).padStart(5, '0')}`;

const SYNTHETIC_NOTE = 'SYNTHETIC PILOT RECORD — not a real student.';

/**
 * A locked credential for every pilot account.
 *
 * `users.password_hash` is NOT NULL, so these rows need something — but a pilot
 * population must not ship with accounts anyone can sign into. This hashes a
 * random secret that is generated per run and never stored, printed or returned,
 * so the hash is well-formed (bcrypt.compare behaves normally and simply always
 * fails) and the password is unknown to everyone including this script.
 *
 * Hashed once and reused: bcrypt at cost 12 takes a few hundred milliseconds, and
 * doing it per row would dominate the runtime for no benefit.
 */
async function lockedPasswordHash(): Promise<string> {
    return hash(randomBytes(32).toString('base64url'), 12);
}

// ─── Provisioning ───────────────────────────────────────────────────────────

interface Options {
    studentsPerBranch: number;
    dryRun: boolean;
}

function parseOptions(argv: string[]): Options {
    const studentsIndex = argv.indexOf('--students');
    const requested = studentsIndex >= 0 ? Number(argv[studentsIndex + 1]) : 120;
    if (!Number.isInteger(requested) || requested < 1 || requested > 5000) {
        throw new Error('--students must be an integer between 1 and 5000.');
    }
    return { studentsPerBranch: requested, dryRun: argv.includes('--dry-run') };
}

async function ensureCompany(client: PoolClient): Promise<string> {
    const existing = await client.query<{ id: string }>(
        'SELECT id FROM companies WHERE name = $1 LIMIT 1',
        [COMPANY_NAME],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await client.query<{ id: string }>(
        `INSERT INTO companies (name, billing_status, region)
         VALUES ($1, 'TRIALING', 'AP-SOUTH') RETURNING id`,
        [COMPANY_NAME],
    );
    return created.rows[0].id;
}

async function provisionBranch(
    client: PoolClient,
    companyId: string,
    branch: Branch,
    options: Options,
    lockedHash: string,
): Promise<{ created: boolean; students: number }> {
    const existing = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE code = $1 LIMIT 1',
        [branch.code],
    );
    if (existing.rows[0]) return { created: false, students: 0 };

    const rng = makeRandom(branch.code);

    const { rows: tenantRows } = await client.query<{ id: string }>(
        `INSERT INTO tenants
             (company_id, name, code, domain, institution_type, address, city, state,
              pincode, phone, email, affiliation_board, is_active)
         VALUES ($1,$2,$3,$4,'K12',$5,$6,$7,$8,$9,$10,'CBSE',true)
         RETURNING id`,
        [
            companyId, branch.name, branch.code, `${branch.code}.scholarmind.app`,
            branch.address, branch.city, branch.state, branch.pincode,
            pilotPhone(1), pilotEmail('office', branch.code),
        ],
    );
    const tenantId = tenantRows[0].id;

    const { rows: yearRows } = await client.query<{ id: string }>(
        `INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
         VALUES ($1,'2026-27','2026-04-01','2027-03-31',true) RETURNING id`,
        [tenantId],
    );
    const academicYearId = yearRows[0].id;

    for (const subject of SUBJECTS) {
        await client.query(
            'INSERT INTO subjects (tenant_id, name, code) VALUES ($1,$2,$3)',
            [tenantId, subject.name, subject.code],
        );
    }

    // Grades and sections, then a flat list of sections to distribute students over.
    const sections: { id: string; gradeIndex: number }[] = [];
    for (const [gradeIndex, gradeName] of GRADE_NAMES.entries()) {
        const { rows: gradeRows } = await client.query<{ id: string }>(
            `INSERT INTO grades (tenant_id, name, numeric_value, display_order)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [tenantId, gradeName, gradeIndex, gradeIndex],
        );
        for (const sectionName of SECTION_NAMES) {
            const { rows: sectionRows } = await client.query<{ id: string }>(
                `INSERT INTO sections (tenant_id, grade_id, academic_year_id, name)
                 VALUES ($1,$2,$3,$4) RETURNING id`,
                [tenantId, gradeRows[0].id, academicYearId, sectionName],
            );
            sections.push({ id: sectionRows[0].id, gradeIndex });
        }
    }

    // Staff. No passwords: these accounts cannot sign in, which is deliberate —
    // a pilot population should not ship with usable credentials.
    let staffIndex = 0;
    for (const { role, count } of STAFF_ROLES) {
        for (let i = 0; i < count; i += 1) {
            staffIndex += 1;
            const first = pick(rng, rng() > 0.5 ? FATHER_NAMES : MOTHER_NAMES);
            const last = pick(rng, SURNAMES);
            await client.query(
                `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
                 VALUES ($1,$2,$3,$4,$5,$6::user_role,true)`,
                [
                    tenantId,
                    pilotEmail(`${first}.${last}.${staffIndex}`, branch.code),
                    lockedHash, first, last, role,
                ],
            );
        }
    }

    const { rows: planRows } = await client.query<{ id: string }>(
        `INSERT INTO fee_plans (tenant_id, academic_year_id, name, description)
         VALUES ($1,$2,'Annual Fee 2026-27','Standard annual fee for all grades') RETURNING id`,
        [tenantId, academicYearId],
    );
    const feePlanId = planRows[0].id;

    for (const component of [
        { name: 'Tuition Fee', amount: '4800.00', frequency: 'MONTHLY', optional: false },
        { name: 'Development Fee', amount: '9000.00', frequency: 'ANNUAL', optional: false },
        { name: 'Examination Fee', amount: '2500.00', frequency: 'ANNUAL', optional: false },
        { name: 'Transport Fee', amount: '2200.00', frequency: 'MONTHLY', optional: true },
    ]) {
        await client.query(
            `INSERT INTO fee_components (fee_plan_id, name, amount, frequency, is_optional)
             VALUES ($1,$2,$3,$4::fee_frequency,$5)`,
            [feePlanId, component.name, component.amount, component.frequency, component.optional],
        );
    }

    // Students, guardians and the fee ledger.
    for (let i = 0; i < options.studentsPerBranch; i += 1) {
        const isBoy = rng() > 0.5;
        const first = pick(rng, isBoy ? BOY_NAMES : GIRL_NAMES);
        const last = pick(rng, SURNAMES);
        const section = sections[i % sections.length];
        const admissionNumber = `${branch.abbr}2026${String(i + 1).padStart(5, '0')}`;

        const { rows: studentRows } = await client.query<{ id: string }>(
            `INSERT INTO students
                 (tenant_id, admission_number, first_name, last_name, date_of_birth, gender,
                  address, city, state, pincode, grade_id, section_id, roll_number,
                  admission_date, custom_data)
             VALUES ($1,$2,$3,$4,$5,$6::gender,$7,$8,$9,$10,
                     (SELECT grade_id FROM sections WHERE id = $11),$11,$12,'2026-04-01',$13::jsonb)
             RETURNING id`,
            [
                tenantId, admissionNumber, first, last,
                `${2026 - section.gradeIndex - 5}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
                isBoy ? 'MALE' : 'FEMALE',
                `${(i % 200) + 1}, ${branch.address}`, branch.city, branch.state, branch.pincode,
                section.id, (i % 40) + 1, JSON.stringify({ pilot: true, note: SYNTHETIC_NOTE }),
            ],
        );
        const studentId = studentRows[0].id;

        const guardianEmail = pilotEmail(`${first}.${last}.parent.${i + 1}`, branch.code);
        const { rows: parentRows } = await client.query<{ id: string }>(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active)
             VALUES ($1,$2,$3,$4,$5,'PARENT',true) RETURNING id`,
            [tenantId, guardianEmail, lockedHash, pick(rng, FATHER_NAMES), last],
        );

        await client.query(
            `INSERT INTO guardians
                 (tenant_id, user_id, student_id, relation, first_name, last_name, email,
                  phone, occupation, is_primary, is_emergency_contact)
             VALUES ($1,$2,$3,'FATHER',$4,$5,$6,$7,$8,true,true)`,
            [
                tenantId, parentRows[0].id, studentId, pick(rng, FATHER_NAMES), last,
                guardianEmail, pilotPhone(i * 2 + 10), pick(rng, OCCUPATIONS),
            ],
        );
        await client.query(
            `INSERT INTO guardians
                 (tenant_id, student_id, relation, first_name, last_name, phone, is_primary)
             VALUES ($1,$2,'MOTHER',$3,$4,$5,false)`,
            [tenantId, studentId, pick(rng, MOTHER_NAMES), last, pilotPhone(i * 2 + 11)],
        );

        // A believable collection position: most paid, some part-paid, some open.
        const roll = rng();
        const total = '16300.00';
        const status = roll < 0.62 ? 'PAID' : roll < 0.82 ? 'PARTIAL' : 'PENDING';
        const paid = status === 'PAID' ? '16300.00' : status === 'PARTIAL' ? '8150.00' : '0.00';

        const { rows: invoiceRows } = await client.query<{ id: string }>(
            `INSERT INTO invoices
                 (tenant_id, student_id, fee_plan_id, invoice_number, total_amount,
                  paid_amount, due_date, status, description)
             VALUES ($1,$2,$3,$4,$5,$6,'2026-05-15',$7::invoice_status,'Term 1 Fee')
             RETURNING id`,
            [
                tenantId, studentId, feePlanId,
                `INV-2026-${branch.abbr}-${String(i + 1).padStart(5, '0')}`,
                total, paid, status,
            ],
        );

        if (status !== 'PENDING') {
            const { rows: paymentRows } = await client.query<{ id: string }>(
                `INSERT INTO payments (tenant_id, invoice_id, student_id, amount, method, status)
                 VALUES ($1,$2,$3,$4,$5::payment_method,'COMPLETED') RETURNING id`,
                [tenantId, invoiceRows[0].id, studentId, paid, pick(rng, ['UPI', 'BANK_TRANSFER', 'CASH'])],
            );
            await client.query(
                'INSERT INTO receipts (tenant_id, payment_id, receipt_number) VALUES ($1,$2,$3)',
                [
                    tenantId, paymentRows[0].id,
                    `RCP-2026-${branch.abbr}-${String(i + 1).padStart(5, '0')}`,
                ],
            );
        }
    }

    return { created: true, students: options.studentsPerBranch };
}

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2));

    console.log(`Provisioning ${BRANCHES.length} pilot branches, ${options.studentsPerBranch} students each.`);
    if (options.dryRun) console.log('DRY RUN — everything is rolled back at the end.\n');

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const companyId = await ensureCompany(client);
            console.log(`  company: ${COMPANY_NAME}`);

            const lockedHash = await lockedPasswordHash();

            let totalStudents = 0;
            for (const branch of BRANCHES) {
                const result = await provisionBranch(client, companyId, branch, options, lockedHash);
                totalStudents += result.students;
                console.log(
                    result.created
                        ? `  created  ${branch.code.padEnd(32)} ${result.students} students`
                        : `  skipped  ${branch.code.padEnd(32)} already provisioned`,
                );
            }

            if (options.dryRun) {
                await client.query('ROLLBACK');
                console.log(`\nDry run complete. ${totalStudents} students would have been created.`);
            } else {
                await client.query('COMMIT');
                console.log(`\nProvisioned ${totalStudents} students across ${BRANCHES.length} branches.`);
                console.log('No administrator accounts were created — use /setup, which also enrols MFA.');
            }
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    });

    await pool.end();
}

main().catch((error) => {
    console.error('Provisioning failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
