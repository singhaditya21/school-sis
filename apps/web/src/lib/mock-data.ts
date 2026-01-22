/**
 * Mock Data Store for Sample Data Display
 * Provides realistic Indian student data across all pages
 */

// Indian First Names
const boyFirstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
    'Krishna', 'Ishaan', 'Shaurya', 'Atharva', 'Advik', 'Pranav', 'Advaith', 'Aarush',
    'Dhruv', 'Kabir', 'Ritvik', 'Arnav', 'Yuvan', 'Vedant', 'Lakshya', 'Rudra',
    'Parth', 'Harsh', 'Yash', 'Rohan', 'Karan', 'Ansh', 'Madhav', 'Shivansh'
];

const girlFirstNames = [
    'Aadhya', 'Ananya', 'Aanya', 'Saanvi', 'Pari', 'Anika', 'Myra', 'Sara',
    'Isha', 'Diya', 'Prisha', 'Navya', 'Aditi', 'Kiara', 'Riya', 'Kavya',
    'Avni', 'Aaradhya', 'Shanaya', 'Tara', 'Nisha', 'Pooja', 'Sneha', 'Shreya'
];

const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Rao',
    'Nair', 'Menon', 'Agarwal', 'Jain', 'Chopra', 'Malhotra', 'Kapoor', 'Mehta',
    'Shah', 'Desai', 'Joshi', 'Kulkarni', 'Banerjee', 'Mukherjee', 'Das', 'Roy'
];

const random = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate student name
export function generateStudentName(): { firstName: string; lastName: string; fullName: string; gender: 'M' | 'F' } {
    const gender = Math.random() > 0.5 ? 'M' : 'F';
    const firstName = random(gender === 'M' ? boyFirstNames : girlFirstNames);
    const lastName = random(lastNames);
    return { firstName, lastName, fullName: `${firstName} ${lastName}`, gender };
}

// Generate class list
export function generateClassList(): { id: string; name: string; grade: number; section: string }[] {
    const classes: { id: string; name: string; grade: number; section: string }[] = [];
    const sections = ['A', 'B', 'C', 'D', 'E', 'F'];

    for (let grade = 1; grade <= 12; grade++) {
        for (const section of sections) {
            classes.push({
                id: `class-${grade}-${section}`,
                name: `Class ${grade}-${section}`,
                grade,
                section
            });
        }
    }
    return classes;
}

// Generate students for a class
export function generateStudentsForClass(classId: string, count: number = 60): MockStudent[] {
    const students: MockStudent[] = [];
    const [, gradeStr, section] = classId.split('-');
    const grade = parseInt(gradeStr);

    for (let i = 0; i < count; i++) {
        const { firstName, lastName, fullName, gender } = generateStudentName();
        const dob = new Date(2026 - grade - 5 - randomInt(0, 1), randomInt(0, 11), randomInt(1, 28));

        students.push({
            id: `student-${classId}-${i}`,
            admissionNumber: `GWD${2025 - Math.floor(grade / 2)}${String(i + 1).padStart(5, '0')}`,
            firstName,
            lastName,
            fullName,
            gender,
            dateOfBirth: dob.toISOString().split('T')[0],
            className: `Class ${grade}-${section}`,
            grade,
            section,
            phone: `9${randomInt(100000000, 999999999)}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomInt(1, 99)}@gmail.com`,
            fatherName: `${random(['Ramesh', 'Suresh', 'Mahesh', 'Rajesh', 'Vinod', 'Anil'])} ${lastName}`,
            motherName: `${random(['Sunita', 'Anita', 'Kavita', 'Rekha', 'Meena', 'Neha'])} ${lastName}`,
            address: `${randomInt(1, 500)}, Sector ${randomInt(1, 50)}, Greenwood City`,
            status: 'Active',
            bloodGroup: random(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
            attendancePercentage: randomInt(75, 100),
            feeStatus: random(['Paid', 'Paid', 'Paid', 'Partial', 'Pending']),
            feeAmount: 15000 + (grade * 2000),
            paidAmount: 0, // Will be calculated
        });

        // Calculate paid amount based on fee status
        const student = students[students.length - 1];
        if (student.feeStatus === 'Paid') {
            student.paidAmount = student.feeAmount;
        } else if (student.feeStatus === 'Partial') {
            student.paidAmount = Math.floor(student.feeAmount * (randomInt(30, 70) / 100));
        }
    }

    return students;
}

// Generate all students
export function generateAllStudents(): MockStudent[] {
    const allStudents: MockStudent[] = [];
    const classes = generateClassList();

    for (const cls of classes) {
        allStudents.push(...generateStudentsForClass(cls.id, 60));
    }

    return allStudents;
}

// Dashboard stats
export function generateDashboardStats() {
    return {
        totalStudents: 4320,
        totalTeachers: 180,
        totalClasses: 72,
        attendanceToday: 92.5,
        feeCollected: 28750000, // 2.87 Cr
        feesPending: 4250000,   // 42.5 L
        admissionLeads: 156,
        upcomingExams: 2
    };
}

// Fee collection stats
export function generateFeeStats() {
    return {
        totalDue: 33000000,
        totalCollected: 28750000,
        pending: 4250000,
        collectionRate: 87.1,
        monthlyBreakdown: [
            { month: 'Apr', collected: 8500000, target: 9000000 },
            { month: 'May', collected: 5200000, target: 5000000 },
            { month: 'Jun', collected: 4800000, target: 5000000 },
            { month: 'Jul', collected: 3200000, target: 4000000 },
            { month: 'Aug', collected: 2800000, target: 3500000 },
            { month: 'Sep', collected: 2100000, target: 3000000 },
            { month: 'Oct', collected: 1500000, target: 2000000 },
            { month: 'Nov', collected: 450000, target: 1000000 },
            { month: 'Dec', collected: 200000, target: 500000 },
        ],
        defaulters: {
            total: 156,
            critical: 23,
            serious: 45,
            warning: 88
        }
    };
}

// Attendance stats
export function generateAttendanceStats() {
    return {
        today: {
            present: 4005,
            absent: 258,
            late: 57,
            total: 4320,
            percentage: 92.7
        },
        weeklyTrend: [
            { day: 'Mon', present: 4102, total: 4320 },
            { day: 'Tue', present: 4085, total: 4320 },
            { day: 'Wed', present: 4110, total: 4320 },
            { day: 'Thu', present: 4005, total: 4320 },
            { day: 'Fri', present: 3998, total: 4320 },
        ],
        classWise: generateClassList().slice(0, 12).map(cls => ({
            className: cls.name,
            present: randomInt(320, 360),
            total: 360,
            percentage: randomInt(88, 99)
        }))
    };
}

// Exam stats
export function generateExamStats() {
    return {
        upcomingExams: [
            { id: 'e1', name: 'Mid-Term Assessment', date: '2025-12-01', classes: 'All Classes' },
            { id: 'e2', name: 'Term 2 Examination', date: '2026-03-01', classes: 'All Classes' }
        ],
        recentResults: {
            examName: 'Term 1 Examination',
            overallPass: 94.2,
            topperName: 'Aadhya Sharma',
            topperClass: 'Class 12-A',
            topperPercentage: 98.6,
            subjectWise: [
                { subject: 'English', average: 78.5, pass: 96 },
                { subject: 'Hindi', average: 75.2, pass: 94 },
                { subject: 'Mathematics', average: 72.8, pass: 91 },
                { subject: 'Science', average: 76.4, pass: 93 },
                { subject: 'Social Science', average: 74.1, pass: 95 }
            ]
        }
    };
}

// Health records stats
export function generateHealthStats() {
    return {
        totalRecords: 3456,
        coverage: 80,
        bmiDistribution: {
            underweight: 312,
            normal: 2789,
            overweight: 298,
            obese: 57
        },
        visionIssues: 234,
        dentalIssues: 187,
        pendingCheckups: 864
    };
}

// Types
export interface MockStudent {
    id: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    gender: 'M' | 'F';
    dateOfBirth: string;
    className: string;
    grade: number;
    section: string;
    phone: string;
    email: string;
    fatherName: string;
    motherName: string;
    address: string;
    status: string;
    bloodGroup: string;
    attendancePercentage: number;
    feeStatus: string;
    feeAmount: number;
    paidAmount: number;
}

// Export singleton instance
let _allStudents: MockStudent[] | null = null;

export function getAllStudents(): MockStudent[] {
    if (!_allStudents) {
        _allStudents = generateAllStudents();
    }
    return _allStudents;
}

export function getStudentById(id: string): MockStudent | undefined {
    return getAllStudents().find(s => s.id === id);
}

export function getStudentsByClass(grade: number, section: string): MockStudent[] {
    return getAllStudents().filter(s => s.grade === grade && s.section === section);
}

export function searchStudents(query: string): MockStudent[] {
    const q = query.toLowerCase();
    return getAllStudents().filter(s =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNumber.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
    ).slice(0, 50);
}
