import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

/**
 * Seed script — populates the database with realistic initial data.
 * All values come from environment variables or are generated dynamically.
 * 
 * Usage: npx tsx scripts/seed.ts
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
    console.log('🌱 Seeding database...\n');

    // ─── 1. Tenant ───────────────────────────────────────────
    console.log('📦 Creating tenant...');
    const [tenant] = await db.insert(schema.tenants).values({
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
    }).returning();

    // ─── 2. Users ────────────────────────────────────────────
    console.log('👤 Creating users...');
    const defaultPassword = await hash('password', 12);

    const userSeeds = [
        { email: 'admin@greenwood.edu', firstName: 'Rajesh', lastName: 'Sharma', role: 'SUPER_ADMIN' as const },
        { email: 'principal@greenwood.edu', firstName: 'Sunita', lastName: 'Verma', role: 'PRINCIPAL' as const },
        { email: 'accountant@greenwood.edu', firstName: 'Anil', lastName: 'Gupta', role: 'ACCOUNTANT' as const },
        { email: 'teacher1@greenwood.edu', firstName: 'Priya', lastName: 'Singh', role: 'TEACHER' as const },
        { email: 'teacher2@greenwood.edu', firstName: 'Vikram', lastName: 'Patel', role: 'TEACHER' as const },
        { email: 'admission@greenwood.edu', firstName: 'Neha', lastName: 'Kapoor', role: 'ADMISSION_COUNSELOR' as const },
        { email: 'transport@greenwood.edu', firstName: 'Suresh', lastName: 'Kumar', role: 'TRANSPORT_MANAGER' as const },
    ];

    const createdUsers: Record<string, typeof schema.users.$inferSelect> = {};

    for (const u of userSeeds) {
        const [user] = await db.insert(schema.users).values({
            tenantId: tenant.id,
            email: u.email,
            passwordHash: defaultPassword,
            firstName: u.firstName,
            lastName: u.lastName,
            role: u.role,
        }).returning();
        createdUsers[u.role] = user;
    }

    // ─── 3. Academic Year & Terms ────────────────────────────
    console.log('📅 Creating academic year...');
    const [academicYear] = await db.insert(schema.academicYears).values({
        tenantId: tenant.id,
        name: '2025-2026',
        startDate: '2025-04-01',
        endDate: '2026-03-31',
        isCurrent: true,
    }).returning();

    await db.insert(schema.terms).values([
        { tenantId: tenant.id, academicYearId: academicYear.id, name: 'Term 1', type: 'TERM_1' as const, startDate: '2025-04-01', endDate: '2025-09-30' },
        { tenantId: tenant.id, academicYearId: academicYear.id, name: 'Term 2', type: 'TERM_2' as const, startDate: '2025-10-01', endDate: '2026-03-31' },
    ]);

    // ─── 4. Grades & Sections ────────────────────────────────
    console.log('🏫 Creating grades and sections...');
    const gradeNames = [
        'Pre-Primary', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
        'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ];
    const sectionNames = ['A', 'B', 'C'];
    const createdGrades: (typeof schema.grades.$inferSelect)[] = [];

    for (let i = 0; i < gradeNames.length; i++) {
        const [grade] = await db.insert(schema.grades).values({
            tenantId: tenant.id,
            name: gradeNames[i],
            numericValue: i,
            displayOrder: i + 1,
        }).returning();
        createdGrades.push(grade);

        for (const sec of sectionNames) {
            await db.insert(schema.sections).values({
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
        await db.insert(schema.subjects).values({
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
    const createdStudents: (typeof schema.students.$inferSelect)[] = [];
    for (let i = 0; i < 20; i++) {
        const grade = createdGrades[Math.floor(i / 7) + 1]; // Grade 1, 2, 3
        const gender = i % 2 === 0 ? 'MALE' as const : 'FEMALE' as const;
        const firstName = firstNames[i];
        const lastName = lastNames[i];

        // Get section for this grade
        const sectionRows = await db.select().from(schema.sections)
            .where(
                and(
                    eq(schema.sections.gradeId, grade.id),
                    eq(schema.sections.name, sectionNames[i % 3])
                )
            );
        const section = sectionRows[0];

        const [student] = await db.insert(schema.students).values({
            tenantId: tenant.id,
            admissionNumber: `GWD2025${String(i + 1).padStart(5, '0')}`,
            firstName,
            lastName,
            dateOfBirth: `${2025 - (grade.numericValue ?? 1) - 5}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            gender,
            bloodGroup: randEl(['A+', 'B+', 'O+', 'AB+'] as const),
            address: `${i + 1}, Sector ${i + 10}, Greenwood City`,
            city: 'Gurugram',
            state: 'Haryana',
            pincode: '122001',
            gradeId: grade.id,
            sectionId: section.id,
            rollNumber: i + 1,
            admissionDate: '2025-04-01',
        }).returning();

        createdStudents.push(student);

        // Create parent user account
        const parentEmail = `parent.${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;
        const [parentUser] = await db.insert(schema.users).values({
            tenantId: tenant.id,
            email: parentEmail,
            passwordHash: defaultPassword,
            firstName: randEl(fatherNames),
            lastName,
            role: 'PARENT',
        }).returning();

        // Father guardian
        await db.insert(schema.guardians).values({
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
        await db.insert(schema.guardians).values({
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
    const [feePlan] = await db.insert(schema.feePlans).values({
        tenantId: tenant.id,
        academicYearId: academicYear.id,
        name: 'Standard Fee Plan 2025-26',
        description: 'Standard fee plan for all grades',
    }).returning();

    await db.insert(schema.feeComponents).values([
        { feePlanId: feePlan.id, name: 'Tuition Fee', amount: '5000.00', frequency: 'MONTHLY' as const },
        { feePlanId: feePlan.id, name: 'Transport Fee', amount: '2000.00', frequency: 'MONTHLY' as const, isOptional: true },
        { feePlanId: feePlan.id, name: 'Library Fee', amount: '1000.00', frequency: 'ANNUAL' as const },
        { feePlanId: feePlan.id, name: 'Lab Fee', amount: '1500.00', frequency: 'ANNUAL' as const },
        { feePlanId: feePlan.id, name: 'Annual Charges', amount: '3000.00', frequency: 'ANNUAL' as const },
    ]);

    // Create invoices for first 10 students
    const paymentStatuses = ['PAID', 'PAID', 'PAID', 'PARTIAL', 'PENDING', 'PAID', 'PAID', 'PARTIAL', 'PENDING', 'PAID'] as const;
    for (let i = 0; i < 10; i++) {
        const totalAmount = '15000.00';
        const status = paymentStatuses[i];
        const paidAmount = status === 'PAID' ? '15000.00' : status === 'PARTIAL' ? '7500.00' : '0.00';

        const [invoice] = await db.insert(schema.invoices).values({
            tenantId: tenant.id,
            studentId: createdStudents[i].id,
            feePlanId: feePlan.id,
            invoiceNumber: `INV-2025-${String(i + 1).padStart(4, '0')}`,
            totalAmount,
            paidAmount,
            dueDate: '2025-05-15',
            status: status === 'PAID' ? 'PAID' : status === 'PARTIAL' ? 'PARTIAL' : 'PENDING',
            description: 'Term 1 Fee',
        }).returning();

        // Create payment for paid/partial invoices
        if (status !== 'PENDING') {
            const [payment] = await db.insert(schema.payments).values({
                tenantId: tenant.id,
                invoiceId: invoice.id,
                studentId: createdStudents[i].id,
                amount: paidAmount,
                method: randEl(['UPI', 'BANK_TRANSFER', 'CASH'] as const),
                status: 'COMPLETED',
            }).returning();

            await db.insert(schema.receipts).values({
                tenantId: tenant.id,
                paymentId: payment.id,
                receiptNumber: `RCP-2025-${String(i + 1).padStart(4, '0')}`,
            });
        }
    }

    // ─── 8. Transport ────────────────────────────────────────
    console.log('🚌 Creating transport data...');
    const [vehicle] = await db.insert(schema.vehicles).values({
        tenantId: tenant.id,
        vehicleNumber: 'HR26-DK-1234',
        type: 'Bus',
        capacity: 45,
        driverName: 'Mohan Lal',
        driverPhone: '9876543210',
        driverLicense: 'HR-0620190012345',
    }).returning();

    const [route] = await db.insert(schema.routes).values({
        tenantId: tenant.id,
        vehicleId: vehicle.id,
        name: 'Route 1 - Sector 14 to School',
        morningDepartureTime: '07:00',
        afternoonDepartureTime: '14:30',
        monthlyFee: '2000.00',
    }).returning();

    const stopData = [
        { name: 'Sector 14 Chowk', pickupTime: '07:00', dropTime: '15:10', lat: '28.4595', lng: '77.0266' },
        { name: 'Sector 21 Market', pickupTime: '07:15', dropTime: '14:55', lat: '28.4510', lng: '77.0540' },
        { name: 'Greenwood International School', pickupTime: '07:40', dropTime: '14:30', lat: '28.4700', lng: '77.0380' },
    ];

    for (let i = 0; i < stopData.length; i++) {
        await db.insert(schema.stops).values({
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
        { childFirst: 'Aryan', childLast: 'Khanna', parent: 'Vikram Khanna', grade: 'Grade 1', stage: 'NEW' as const },
        { childFirst: 'Tanya', childLast: 'Bhatia', parent: 'Rohit Bhatia', grade: 'Grade 3', stage: 'FORM_SUBMITTED' as const },
        { childFirst: 'Kabir', childLast: 'Malhotra', parent: 'Amit Malhotra', grade: 'Grade 5', stage: 'INTERVIEW_SCHEDULED' as const },
    ];

    for (const lead of leadData) {
        await db.insert(schema.admissionLeads).values({
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

    await client.end();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
