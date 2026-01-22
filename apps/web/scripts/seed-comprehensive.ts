/**
 * Comprehensive Sample Data Generator
 * Generates 4,320 students (Classes 1-12, Sections A-F, 60 per section)
 * with realistic Indian names and data across all modules
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Indian First Names (Boys)
const boyFirstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
    'Krishna', 'Ishaan', 'Shaurya', 'Atharva', 'Advik', 'Pranav', 'Advaith', 'Aarush',
    'Dhruv', 'Kabir', 'Ritvik', 'Arnav', 'Yuvan', 'Vedant', 'Lakshya', 'Rudra',
    'Parth', 'Harsh', 'Yash', 'Rohan', 'Karan', 'Ansh', 'Madhav', 'Shivansh',
    'Darsh', 'Anirudh', 'Tanmay', 'Rishi', 'Sahil', 'Prateek', 'Siddharth', 'Aryan',
    'Rahul', 'Amit', 'Vikram', 'Nikhil', 'Gaurav', 'Deepak', 'Akash', 'Rajesh',
    'Mohit', 'Kunal', 'Varun', 'Neeraj', 'Ajay', 'Sanjay', 'Vishal', 'Manish'
];

// Indian First Names (Girls)
const girlFirstNames = [
    'Aadhya', 'Ananya', 'Aanya', 'Saanvi', 'Pari', 'Anika', 'Myra', 'Sara',
    'Isha', 'Diya', 'Prisha', 'Navya', 'Aditi', 'Kiara', 'Riya', 'Kavya',
    'Avni', 'Aaradhya', 'Shanaya', 'Tara', 'Nisha', 'Pooja', 'Sneha', 'Shreya',
    'Divya', 'Kriti', 'Anjali', 'Neha', 'Ankita', 'Priya', 'Simran', 'Tanvi',
    'Khushi', 'Manya', 'Zara', 'Ira', 'Aisha', 'Mahira', 'Sanya', 'Trisha',
    'Meera', 'Nandini', 'Swati', 'Pallavi', 'Deepika', 'Sakshi', 'Rashi', 'Lavanya'
];

// Indian Last Names
const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Rao',
    'Nair', 'Menon', 'Pillai', 'Iyer', 'Iyengar', 'Krishnan', 'Agarwal', 'Jain',
    'Chopra', 'Malhotra', 'Kapoor', 'Mehta', 'Shah', 'Desai', 'Joshi', 'Kulkarni',
    'Patil', 'Shinde', 'More', 'Pawar', 'Chavan', 'Kamble', 'Jadhav', 'Gaikwad',
    'Banerjee', 'Mukherjee', 'Chatterjee', 'Ghosh', 'Das', 'Roy', 'Sen', 'Bose',
    'Saxena', 'Srivastava', 'Tiwari', 'Pandey', 'Shukla', 'Mishra', 'Tripathi', 'Dubey',
    'Chauhan', 'Yadav', 'Rajput', 'Thakur', 'Rathore', 'Bhardwaj', 'Tyagi', 'Goel'
];

// Indian Father Names  
const fatherFirstNames = [
    'Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Mukesh', 'Rakesh', 'Dinesh', 'Naresh',
    'Ashok', 'Vinod', 'Manoj', 'Anil', 'Sunil', 'Ravi', 'Vijay', 'Sanjay',
    'Ajay', 'Pramod', 'Arun', 'Vikas', 'Sandeep', 'Deepak', 'Manish', 'Amit',
    'Sumit', 'Rohit', 'Rajiv', 'Pradeep', 'Anand', 'Kishore', 'Mohan', 'Sohan'
];

// Indian Mother Names
const motherFirstNames = [
    'Sunita', 'Anita', 'Suman', 'Rekha', 'Kavita', 'Savita', 'Geeta', 'Seema',
    'Meena', 'Neena', 'Renu', 'Poonam', 'Jyoti', 'Shanti', 'Lata', 'Usha',
    'Nirmala', 'Kamla', 'Shakuntala', 'Radha', 'Sita', 'Durga', 'Lakshmi', 'Priya',
    'Archana', 'Vandana', 'Sadhana', 'Komal', 'Kamal', 'Swati', 'Preeti', 'Neetu'
];

// Blood Groups
const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Vision Status
const visionStatuses = ['Normal', 'Normal', 'Normal', 'Mild Myopia', 'Corrected'];

// Dental Status
const dentalStatuses = ['Healthy', 'Healthy', 'Healthy', 'Cavity Treated', 'Braces'];

// Helper functions
const random = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;
const randomPhone = (): string => `9${randomInt(100000000, 999999999)}`;
const randomEmail = (name: string): string => `${name.toLowerCase().replace(' ', '.')}${randomInt(1, 999)}@gmail.com`;

// Generate date of birth based on class
const generateDOB = (classNum: number): Date => {
    const currentYear = 2026;
    const birthYear = currentYear - classNum - 5 - randomInt(0, 1);
    const month = randomInt(1, 12);
    const day = randomInt(1, 28);
    return new Date(birthYear, month - 1, day);
};

// Generate admission number
const generateAdmissionNo = (year: number, sequence: number): string => {
    return `GWD${year}${String(sequence).padStart(5, '0')}`;
};

// Main seed function
async function seedData() {
    const tenantId = '00000000-0000-0000-0000-000000000001';
    const academicYearId = 'a1000000-0000-0000-0000-000000000001';

    console.log('🎓 Starting comprehensive data generation...');
    console.log('📊 Target: 12 classes × 6 sections × 60 students = 4,320 students\n');

    const classes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
    const studentsPerSection = 60;

    let totalStudents = 0;
    let sequence = 1;

    for (const classNum of classes) {
        for (const section of sections) {
            console.log(`📚 Generating Class ${classNum}-${section}...`);

            // Create or get class group
            const classGroup = await prisma.classGroup.upsert({
                where: {
                    id: `cg-${classNum}-${section}`,
                },
                update: {},
                create: {
                    id: `cg-${classNum}-${section}`,
                    tenantId,
                    name: `Class ${classNum}-${section}`,
                    grade: classNum,
                    section,
                    academicYearId,
                    capacity: 60,
                },
            });

            // Generate students for this section
            for (let i = 0; i < studentsPerSection; i++) {
                const isBoy = Math.random() > 0.5;
                const firstName = random(isBoy ? boyFirstNames : girlFirstNames);
                const lastName = random(lastNames);
                const fatherName = `${random(fatherFirstNames)} ${lastName}`;
                const motherName = `${random(motherFirstNames)} ${lastName}`;

                const studentName = `${firstName} ${lastName}`;
                const dob = generateDOB(classNum);
                const admissionNo = generateAdmissionNo(2025 - classNum, sequence);

                // Create student
                const student = await prisma.student.create({
                    data: {
                        tenantId,
                        admissionNumber: admissionNo,
                        firstName,
                        lastName,
                        dateOfBirth: dob,
                        gender: isBoy ? 'MALE' : 'FEMALE',
                        bloodGroup: random(bloodGroups),
                        classGroupId: classGroup.id,
                        status: 'ACTIVE',
                        fatherName,
                        motherName,
                        address: `${randomInt(1, 500)}, Sector ${randomInt(1, 50)}, Greenwood City`,
                        city: 'Greenwood City',
                        state: 'Maharashtra',
                        pincode: `40${randomInt(1000, 9999)}`,
                        phone: randomPhone(),
                        email: randomEmail(studentName),
                    },
                });

                // Create guardian (father)
                await prisma.guardian.create({
                    data: {
                        tenantId,
                        firstName: fatherName.split(' ')[0],
                        lastName,
                        relationship: 'FATHER',
                        phone: randomPhone(),
                        email: randomEmail(fatherName),
                        occupation: random(['Engineer', 'Doctor', 'Teacher', 'Business', 'Government', 'IT Professional', 'Lawyer', 'Accountant']),
                    },
                });

                // Create health record (for about 80% of students)
                if (Math.random() > 0.2) {
                    const height = 100 + (classNum * 8) + randomInt(-5, 10);
                    const weight = 20 + (classNum * 4) + randomInt(-3, 8);
                    const bmi = weight / ((height / 100) ** 2);

                    await prisma.healthRecord.create({
                        data: {
                            tenantId,
                            studentId: student.id,
                            academicYearId,
                            recordDate: new Date(),
                            heightCm: height,
                            weightKg: weight,
                            bmi: Math.round(bmi * 10) / 10,
                            bloodGroup: student.bloodGroup || random(bloodGroups),
                            visionLeft: '6/6',
                            visionRight: '6/6',
                            visionStatus: random(visionStatuses),
                            hearingStatus: 'Normal',
                            dentalStatus: random(dentalStatuses),
                        },
                    });
                }

                // Create attendance records (last 30 days for about 70% of students)
                if (Math.random() > 0.3) {
                    const today = new Date();
                    for (let d = 1; d <= 30; d++) {
                        const date = new Date(today);
                        date.setDate(date.getDate() - d);

                        // Skip weekends
                        if (date.getDay() === 0 || date.getDay() === 6) continue;

                        const status = Math.random() > 0.1 ? 'PRESENT' : (Math.random() > 0.5 ? 'ABSENT' : 'LATE');

                        await prisma.attendance.create({
                            data: {
                                tenantId,
                                studentId: student.id,
                                classGroupId: classGroup.id,
                                date,
                                status,
                                markedBy: '00000000-0000-0000-0000-000000000002', // Teacher
                            },
                        });
                    }
                }

                // Create fee invoice (for all students)
                const feeAmount = 15000 + (classNum * 2000); // Higher classes pay more
                const isPaid = Math.random() > 0.15; // 85% paid
                const dueDate = new Date(2025, 3, 15); // April 15

                const invoice = await prisma.invoice.create({
                    data: {
                        tenantId,
                        studentId: student.id,
                        invoiceNumber: `INV-2025-${String(sequence).padStart(5, '0')}`,
                        academicYearId,
                        dueDate,
                        totalAmount: feeAmount,
                        paidAmount: isPaid ? feeAmount : (Math.random() > 0.5 ? feeAmount / 2 : 0),
                        status: isPaid ? 'PAID' : (Math.random() > 0.5 ? 'PARTIAL' : 'PENDING'),
                    },
                });

                // Create payment if paid
                if (isPaid || invoice.paidAmount > 0) {
                    await prisma.payment.create({
                        data: {
                            tenantId,
                            invoiceId: invoice.id,
                            amount: invoice.paidAmount,
                            paymentDate: new Date(2025, 3, randomInt(1, 15)),
                            paymentMode: random(['ONLINE', 'CASH', 'CHEQUE', 'UPI']),
                            referenceNumber: `TXN${randomInt(100000000, 999999999)}`,
                            receivedBy: '00000000-0000-0000-0000-000000000003', // Accountant
                        },
                    });
                }

                // Create exam marks (for Term 1 exam - completed)
                const subjects = ['s1000001', 's1000002', 's1000003', 's1000004', 's1000005'];
                for (const subjectId of subjects) {
                    const marks = randomInt(35, 100);
                    await prisma.mark.create({
                        data: {
                            tenantId,
                            examId: 'e1000001-0000-0000-0000-000000000001',
                            studentId: student.id,
                            subjectId: `${subjectId}-0000-0000-0000-000000000001`,
                            marksObtained: marks,
                            absent: marks < 35 ? Math.random() > 0.8 : false,
                            enteredBy: '00000000-0000-0000-0000-000000000002',
                            verificationStatus: Math.random() > 0.1 ? 'VERIFIED' : 'PENDING',
                        },
                    });
                }

                totalStudents++;
                sequence++;
            }
        }
        console.log(`  ✅ Class ${classNum} complete (${sections.length * studentsPerSection} students)`);
    }

    console.log(`\n🎉 Data generation complete!`);
    console.log(`📊 Total students created: ${totalStudents}`);
    console.log(`👨‍👩‍👧 Guardians created: ${totalStudents}`);
    console.log(`🏥 Health records created: ~${Math.floor(totalStudents * 0.8)}`);
    console.log(`📋 Attendance records created: ~${Math.floor(totalStudents * 0.7 * 22)}`);
    console.log(`💰 Invoices created: ${totalStudents}`);
    console.log(`📝 Exam marks created: ~${totalStudents * 5}`);
}

// Run seed
seedData()
    .then(() => {
        console.log('\n✅ Seed completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
