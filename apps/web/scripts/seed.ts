import { Pool, type QueryResultRow } from 'pg';
import { hash } from 'bcryptjs';
import { createSqlTag, identifier, type ColumnRef } from '../../../packages/api/src/db/sql';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';
import {
    companies, tenants, users, academicYears, terms, grades, sections, subjects,
    students, guardians, feePlans, feeComponents, invoices, payments, receipts,
    vehicles, routes, stops, admissionLeads, attendanceRecords, gradingScales,
    gradingRubrics, homeworkAssignments, homeworkSubmissions,
    type UsersRow, type GradesRow, type StudentsRow,
} from '../../../packages/api/src/db/generated/tables';

/**
 * Seed script — populates the database with realistic initial data.
 * All values come from environment variables or are generated dynamically.
 *
 * Usage: pnpm db:seed  (tsx scripts/seed.ts)
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

// A direct owner connection. Seeding writes across every tenant, so it deliberately
// bypasses the app's RLS-routing pool (which requires a signed per-request tenant
// context) and talks to Postgres straight through node-pg.
const pool = new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
    max: 1,
});
const sql = createSqlTag(() => pool);

/**
 * INSERT one row from a generated table object and a values map keyed by the table's
 * own column properties, returning the inserted row. The keys are checked against the
 * table at compile time (a drifted column name fails `tsc`), and every value is bound
 * as a parameter — nothing a caller passes becomes SQL text.
 */
async function insertRow<T extends { readonly $name: string }, Row extends QueryResultRow = QueryResultRow>(
    table: T,
    values: { [K in Exclude<keyof T, '$name'>]?: unknown },
): Promise<Row> {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => `"${((table as Record<string, unknown>)[key] as ColumnRef).column}"`).join(', ');
    const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
    const params = entries.map(([, value]) => value);
    const { rows } = await pool.query<Row>(
        `INSERT INTO "${table.$name}" (${columns}) VALUES (${placeholders}) RETURNING *`,
        params,
    );
    return rows[0];
}

async function seed() {
    console.log('🌱 Seeding database...\n');

    console.log('🧹 Cleaning existing data...');
    await pool.query(`
        DO $$ DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
        END $$;
    `);

    // ─── 1. Company (group) + Tenant (school) ────────────────
    // Every school belongs to a group; the tenancy FKs require it, and the
    // owners tier is filled automatically by the company/tenant triggers.
    console.log('📦 Creating company and tenant...');
    const company = await insertRow<typeof companies, { id: string }>(companies, {
        id: '0c413c23-6f0f-40ab-bd41-73e6e996ff34',
        name: 'Greenwood Education Trust',
    });

    const tenant = await insertRow<typeof tenants, { id: string; name: string }>(tenants, {
        id: '0c413c23-6f0f-40ab-bd41-73e6e996ff35',
        companyId: company.id,
        name: 'Greenwood International School',
        code: 'GREENWOOD',
        address: '123 Education Lane, Sector 15',
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122001',
        phone: '0124-4567890',
        email: 'info@greenwood.edu',
        website: 'https://greenwood.edu',
        affiliationBoard: 'CBSE',
        affiliationNumber: '2130045',
        udiseCode: '06060100101',
    });

    // ─── 2. Users ────────────────────────────────────────────
    console.log('👤 Creating users...');
    const seedPassword = process.env.SEED_USER_PASSWORD;
    if (!seedPassword || seedPassword.length < 12) {
        throw new Error('SEED_USER_PASSWORD is required and must be at least 12 characters.');
    }
    const defaultPassword = await hash(seedPassword, 12);

    const userSeeds = [
        { email: 'admin@greenwood.edu', firstName: 'Rajesh', lastName: 'Sharma', role: 'SUPER_ADMIN' },
        { email: 'principal@greenwood.edu', firstName: 'Sunita', lastName: 'Verma', role: 'PRINCIPAL' },
        { email: 'accountant@greenwood.edu', firstName: 'Anil', lastName: 'Gupta', role: 'ACCOUNTANT' },
        { email: 'teacher1@greenwood.edu', firstName: 'Priya', lastName: 'Singh', role: 'TEACHER' },
        { email: 'teacher2@greenwood.edu', firstName: 'Vikram', lastName: 'Patel', role: 'TEACHER' },
        { email: 'admission@greenwood.edu', firstName: 'Neha', lastName: 'Kapoor', role: 'ADMISSION_COUNSELOR' },
        { email: 'transport@greenwood.edu', firstName: 'Suresh', lastName: 'Kumar', role: 'TRANSPORT_MANAGER' },
    ];

    const createdUsers: Record<string, UsersRow> = {};

    for (const u of userSeeds) {
        const user = await insertRow<typeof users, UsersRow>(users, {
            tenantId: tenant.id,
            email: u.email,
            passwordHash: defaultPassword,
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
        });
        createdUsers[u.role] = user;
    }

    // ─── 3. Academic Year & Terms ────────────────────────────
    console.log('📅 Creating academic year...');
    const academicYear = await insertRow<typeof academicYears, { id: string }>(academicYears, {
        tenantId: tenant.id,
        name: '2025-2026',
        startDate: '2025-04-01',
        endDate: '2026-03-31',
        isCurrent: true,
    });

    for (const term of [
        { name: 'Term 1', type: 'TERM_1', startDate: '2025-04-01', endDate: '2025-09-30' },
        { name: 'Term 2', type: 'TERM_2', startDate: '2025-10-01', endDate: '2026-03-31' },
    ]) {
        await insertRow(terms, {
            tenantId: tenant.id,
            academicYearId: academicYear.id,
            name: term.name,
            type: term.type,
            startDate: term.startDate,
            endDate: term.endDate,
        });
    }

    // ─── 4. Grades & Sections ────────────────────────────────
    console.log('🏫 Creating grades and sections...');
    const gradeNames = [
        'Pre-Primary', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
        'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ];
    const sectionNames = ['A', 'B', 'C'];
    const createdGrades: GradesRow[] = [];

    for (let i = 0; i < gradeNames.length; i++) {
        const grade = await insertRow<typeof grades, GradesRow>(grades, {
            tenantId: tenant.id,
            name: gradeNames[i],
            numericValue: i,
            displayOrder: i + 1,
        });
        createdGrades.push(grade);

        for (const sec of sectionNames) {
            await insertRow(sections, {
                tenantId: tenant.id,
                gradeId: grade.id,
                academicYearId: academicYear.id,
                name: sec,
                capacity: 60,
            });
        }
    }

    // ─── 5. Subjects ─────────────────────────────────────────
    console.log('📚 Creating subjects...');
    const subjectSeeds = [
        { name: 'English', code: 'ENG' },
        { name: 'Hindi', code: 'HIN' },
        { name: 'Mathematics', code: 'MAT' },
        { name: 'Science', code: 'SCI' },
        { name: 'Social Science', code: 'SOC' },
        { name: 'Computer Science', code: 'CS' },
        { name: 'Physical Education', code: 'PE' },
        { name: 'Art & Craft', code: 'ART' },
    ];

    for (const sub of subjectSeeds) {
        await insertRow(subjects, {
            tenantId: tenant.id,
            name: sub.name,
            code: sub.code,
        });
    }

    // ─── 6. Students & Guardians ─────────────────────────────
    console.log('🧑‍🎓 Creating students and guardians...');
    const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Ananya', 'Diya', 'Ishaan', 'Kavya', 'Arjun', 'Saanvi', 'Reyansh',
        'Prisha', 'Vihaan', 'Myra', 'Sai', 'Kiara', 'Krishna', 'Navya', 'Dhruv', 'Riya', 'Atharva'];
    const lastNames = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Rao', 'Nair', 'Menon',
        'Agarwal', 'Jain', 'Chopra', 'Malhotra', 'Kapoor', 'Mehta', 'Shah', 'Desai', 'Joshi', 'Kulkarni'];
    const fatherNames = ['Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Vinod', 'Anil', 'Amit', 'Vivek', 'Sanjay', 'Deepak'];
    const motherNames = ['Sunita', 'Anita', 'Kavita', 'Rekha', 'Meena', 'Neha', 'Pooja', 'Swati', 'Priti', 'Geeta'];
    const randEl = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // Create 20 students across first 3 grades
    const createdStudents: StudentsRow[] = [];
    for (let i = 0; i < 20; i++) {
        const grade = createdGrades[Math.floor(i / 7) + 1]; // Grade 1, 2, 3
        const gender = i % 2 === 0 ? 'MALE' : 'FEMALE';
        const firstName = firstNames[i];
        const lastName = lastNames[i];

        // Get section for this grade
        const sectionRows = await sql<{ id: string }>`
            SELECT id FROM ${identifier(sections.$name)}
            WHERE ${sections.gradeId} = ${grade.id} AND ${sections.name} = ${sectionNames[i % 3]}
        `.rows();
        const section = sectionRows[0];

        const studentValues: { [K in Exclude<keyof typeof students, '$name'>]?: unknown } = {
            tenantId: tenant.id,
            admissionNumber: `GWD2025${String(i + 1).padStart(5, '0')}`,
            firstName,
            lastName,
            dateOfBirth: `${2025 - (grade.numericValue ?? 1) - 5}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            gender,
            bloodGroup: randEl(['A+', 'B+', 'O+', 'AB+']),
            address: `${i + 1}, Sector ${i + 10}, Greenwood City`,
            city: 'Gurugram',
            state: 'Haryana',
            pincode: '122001',
            gradeId: grade.id,
            sectionId: section.id,
            rollNumber: i + 1,
            admissionDate: '2025-04-01',
        };
        if (i === 0) {
            studentValues.id = 'ad50cb20-83f0-42bf-bce6-770addf54375';
        }
        const student = await insertRow<typeof students, StudentsRow>(students, studentValues);

        createdStudents.push(student);

        // Create parent user account
        const parentEmail = `parent.${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;
        const parentUser = await insertRow<typeof users, { id: string }>(users, {
            tenantId: tenant.id,
            email: parentEmail,
            passwordHash: defaultPassword,
            firstName: randEl(fatherNames),
            lastName,
            role: 'PARENT',
        });

        // Father guardian
        await insertRow(guardians, {
            tenantId: tenant.id,
            userId: parentUser.id,
            studentId: student.id,
            relation: 'FATHER',
            firstName: randEl(fatherNames),
            lastName,
            email: parentEmail,
            phone: `98${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
            occupation: randEl(['Engineer', 'Doctor', 'Business', 'Teacher', 'Lawyer']),
            isPrimary: true,
            isEmergencyContact: true,
        });

        // Mother guardian
        await insertRow(guardians, {
            tenantId: tenant.id,
            studentId: student.id,
            relation: 'MOTHER',
            firstName: randEl(motherNames),
            lastName,
            phone: `97${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
            isPrimary: false,
        });
    }

    // ─── 7. Fee Plans & Invoices ─────────────────────────────
    console.log('💰 Creating fee plans and invoices...');
    const feePlan = await insertRow<typeof feePlans, { id: string }>(feePlans, {
        tenantId: tenant.id,
        academicYearId: academicYear.id,
        name: 'Standard Fee Plan 2025-26',
        description: 'Standard fee plan for all grades',
    });

    for (const component of [
        { name: 'Tuition Fee', amount: '5000.00', frequency: 'MONTHLY', isOptional: undefined },
        { name: 'Transport Fee', amount: '2000.00', frequency: 'MONTHLY', isOptional: true },
        { name: 'Library Fee', amount: '1000.00', frequency: 'ANNUAL', isOptional: undefined },
        { name: 'Lab Fee', amount: '1500.00', frequency: 'ANNUAL', isOptional: undefined },
        { name: 'Annual Charges', amount: '3000.00', frequency: 'ANNUAL', isOptional: undefined },
    ]) {
        await insertRow(feeComponents, {
            feePlanId: feePlan.id,
            name: component.name,
            amount: component.amount,
            frequency: component.frequency,
            isOptional: component.isOptional,
        });
    }

    // Create invoices for first 10 students
    const paymentStatuses = ['PAID', 'PAID', 'PAID', 'PARTIAL', 'PENDING', 'PAID', 'PAID', 'PARTIAL', 'PENDING', 'PAID'] as const;
    for (let i = 0; i < 10; i++) {
        const totalAmount = '15000.00';
        const status = paymentStatuses[i];
        const paidAmount = status === 'PAID' ? '15000.00' : status === 'PARTIAL' ? '7500.00' : '0.00';

        const invoice = await insertRow<typeof invoices, { id: string }>(invoices, {
            tenantId: tenant.id,
            studentId: createdStudents[i].id,
            feePlanId: feePlan.id,
            invoiceNumber: `INV-2025-${String(i + 1).padStart(4, '0')}`,
            totalAmount,
            paidAmount,
            dueDate: '2025-05-15',
            status: status === 'PAID' ? 'PAID' : status === 'PARTIAL' ? 'PARTIAL' : 'PENDING',
            description: 'Term 1 Fee',
        });

        // Create payment for paid/partial invoices
        if (status !== 'PENDING') {
            const payment = await insertRow<typeof payments, { id: string }>(payments, {
                tenantId: tenant.id,
                invoiceId: invoice.id,
                studentId: createdStudents[i].id,
                amount: paidAmount,
                method: randEl(['UPI', 'BANK_TRANSFER', 'CASH']),
                status: 'COMPLETED',
            });

            await insertRow(receipts, {
                tenantId: tenant.id,
                paymentId: payment.id,
                receiptNumber: `RCP-2025-${String(i + 1).padStart(4, '0')}`,
            });
        }
    }

    // ─── 8. Transport ────────────────────────────────────────
    console.log('🚌 Creating transport data...');
    const vehicle = await insertRow<typeof vehicles, { id: string }>(vehicles, {
        tenantId: tenant.id,
        vehicleNumber: 'HR26-DK-1234',
        type: 'Bus',
        capacity: 45,
        driverName: 'Mohan Lal',
        driverPhone: '9876543210',
        driverLicense: 'HR-0620190012345',
    });

    const route = await insertRow<typeof routes, { id: string }>(routes, {
        tenantId: tenant.id,
        vehicleId: vehicle.id,
        name: 'Route 1 - Sector 14 to School',
        morningDepartureTime: '07:00',
        afternoonDepartureTime: '14:30',
        monthlyFee: '2000.00',
    });

    const stopData = [
        { name: 'Sector 14 Chowk', pickupTime: '07:00', dropTime: '15:10', lat: '28.4595', lng: '77.0266' },
        { name: 'Sector 21 Market', pickupTime: '07:15', dropTime: '14:55', lat: '28.4510', lng: '77.0540' },
        { name: 'Greenwood International School', pickupTime: '07:40', dropTime: '14:30', lat: '28.4700', lng: '77.0380' },
    ];

    for (let i = 0; i < stopData.length; i++) {
        await insertRow(stops, {
            routeId: route.id,
            name: stopData[i].name,
            pickupTime: stopData[i].pickupTime,
            dropTime: stopData[i].dropTime,
            latitude: stopData[i].lat,
            longitude: stopData[i].lng,
            displayOrder: i + 1,
        });
    }

    // ─── 9. Admission Leads ──────────────────────────────────
    console.log('📋 Creating admission leads...');
    const leadData = [
        { childFirst: 'Aryan', childLast: 'Khanna', parent: 'Vikram Khanna', grade: 'Grade 1', stage: 'NEW' },
        { childFirst: 'Tanya', childLast: 'Bhatia', parent: 'Rohit Bhatia', grade: 'Grade 3', stage: 'FORM_SUBMITTED' },
        { childFirst: 'Kabir', childLast: 'Malhotra', parent: 'Amit Malhotra', grade: 'Grade 5', stage: 'INTERVIEW_SCHEDULED' },
    ];

    for (const lead of leadData) {
        await insertRow(admissionLeads, {
            tenantId: tenant.id,
            childFirstName: lead.childFirst,
            childLastName: lead.childLast,
            applyingForGrade: lead.grade,
            parentName: lead.parent,
            parentEmail: `${lead.parent.toLowerCase().replace(' ', '.')}@gmail.com`,
            parentPhone: `99${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
            stage: lead.stage,
            assignedTo: createdUsers['ADMISSION_COUNSELOR']?.id,
        });
    }

    // ─── 10. Attendance ──────────────────────────────────────
    console.log('📅 Creating attendance records...');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (let i = 0; i < 5; i++) {
        await insertRow(attendanceRecords, {
            tenantId: tenant.id,
            studentId: createdStudents[i].id,
            sectionId: createdStudents[i].sectionId,
            date: yesterday.toISOString().split('T')[0],
            status: randEl(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT']),
            markedBy: createdUsers['TEACHER']?.id,
        });
    }

    // ─── 11. Grading Scales & Rubrics ─────────────────────────
    console.log('📊 Creating grading scales...');
    const gpaScale = await insertRow<typeof gradingScales, { id: string }>(gradingScales, {
        tenantId: tenant.id,
        name: 'Standard GPA (4.0)',
        type: 'GPA',
    });

    for (const rubric of [
        { label: 'A', minScore: '90', maxScore: '100', gpaValue: '4.0' },
        { label: 'B', minScore: '80', maxScore: '89.9', gpaValue: '3.0' },
        { label: 'C', minScore: '70', maxScore: '79.9', gpaValue: '2.0' },
        { label: 'F', minScore: '0', maxScore: '69.9', gpaValue: '0.0' },
    ]) {
        await insertRow(gradingRubrics, {
            scaleId: gpaScale.id,
            label: rubric.label,
            minScore: rubric.minScore,
            maxScore: rubric.maxScore,
            gpaValue: rubric.gpaValue,
        });
    }

    // ─── 12. Homework ─────────────────────────────────────────
    console.log('📝 Creating homework assignments...');
    const mathSubjects = await sql<{ id: string }>`
        SELECT id FROM ${identifier(subjects.$name)}
        WHERE ${subjects.code} = ${'MAT'} AND ${subjects.tenantId} = ${tenant.id} LIMIT 1
    `.rows();
    if (mathSubjects.length > 0) {
        const homework = await insertRow<typeof homeworkAssignments, { id: string }>(homeworkAssignments, {
            tenantId: tenant.id,
            title: 'Fractions Worksheet',
            description: 'Complete questions 1-20 in the textbook.',
            subjectId: mathSubjects[0].id,
            dueDate: new Date(today.getTime() + 86400000).toISOString(),
            assignedBy: createdUsers['TEACHER']?.id,
            maxMarks: '20',
        });

        // NOTE: the migrated homework_submissions has no `status` column (the old
        // Drizzle schema's `status` was dropped), so it is not set here.
        await insertRow(homeworkSubmissions, {
            tenantId: tenant.id,
            assignmentId: homework.id,
            studentId: createdStudents[0].id,
            submittedAt: today,
        });
    }

    console.log('\n✅ Seed complete!');
    console.log(`   📦 1 tenant (${tenant.name})`);
    console.log(`   👤 ${Object.keys(createdUsers).length + 20} users (${Object.keys(createdUsers).length} staff + 20 parents)`);
    console.log(`   📅 1 academic year, 2 terms`);
    console.log(`   🏫 ${gradeNames.length} grades, ${gradeNames.length * sectionNames.length} sections`);
    console.log(`   📚 ${subjectSeeds.length} subjects`);
    console.log(`   🧑‍🎓 20 students with guardians`);
    console.log(`   💰 1 fee plan, 10 invoices`);
    console.log(`   🚌 1 vehicle, 1 route, 3 stops`);
    console.log(`   📋 3 admission leads`);

    await pool.end();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
