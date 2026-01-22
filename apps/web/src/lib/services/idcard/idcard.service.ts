// ID Card Generation Service

export interface IDCardTemplate {
    id: string;
    name: string;
    type: 'student' | 'staff';
    backgroundColor: string;
    textColor: string;
    logoPosition: 'left' | 'center' | 'right';
    fields: string[];
}

export interface StudentIDCard {
    id: string;
    studentId: string;
    studentName: string;
    class: string;
    section: string;
    rollNo: string;
    dob: string;
    bloodGroup: string;
    address: string;
    parentName: string;
    parentPhone: string;
    photo: string;
    validFrom: string;
    validTo: string;
    qrCode: string;
    status: 'pending' | 'printed' | 'issued';
}

export interface StaffIDCard {
    id: string;
    staffId: string;
    staffName: string;
    designation: string;
    department: string;
    dob: string;
    bloodGroup: string;
    address: string;
    phone: string;
    email: string;
    joiningDate: string;
    photo: string;
    validFrom: string;
    validTo: string;
    qrCode: string;
    status: 'pending' | 'printed' | 'issued';
}

// Mock Templates
const mockTemplates: IDCardTemplate[] = [
    {
        id: 'tpl-1',
        name: 'Standard Blue',
        type: 'student',
        backgroundColor: '#1e40af',
        textColor: '#ffffff',
        logoPosition: 'center',
        fields: ['name', 'class', 'rollNo', 'dob', 'bloodGroup', 'photo', 'qrCode'],
    },
    {
        id: 'tpl-2',
        name: 'Modern Green',
        type: 'student',
        backgroundColor: '#15803d',
        textColor: '#ffffff',
        logoPosition: 'left',
        fields: ['name', 'class', 'rollNo', 'parentPhone', 'photo', 'qrCode'],
    },
    {
        id: 'tpl-3',
        name: 'Staff Professional',
        type: 'staff',
        backgroundColor: '#7c3aed',
        textColor: '#ffffff',
        logoPosition: 'center',
        fields: ['name', 'designation', 'department', 'phone', 'photo', 'qrCode'],
    },
];

// Mock Student Cards
const mockStudentCards: StudentIDCard[] = [
    {
        id: 'card-1',
        studentId: 'STU001',
        studentName: 'Rahul Sharma',
        class: 'Class 10',
        section: 'A',
        rollNo: '15',
        dob: '2010-05-15',
        bloodGroup: 'O+',
        address: '123 MG Road, Delhi',
        parentName: 'Suresh Sharma',
        parentPhone: '9876543210',
        photo: '/placeholder-student.jpg',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        qrCode: 'STU001-2026',
        status: 'issued',
    },
    {
        id: 'card-2',
        studentId: 'STU002',
        studentName: 'Priya Patel',
        class: 'Class 9',
        section: 'B',
        rollNo: '08',
        dob: '2011-08-22',
        bloodGroup: 'A+',
        address: '456 Park Street, Mumbai',
        parentName: 'Rajesh Patel',
        parentPhone: '9876543211',
        photo: '/placeholder-student.jpg',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        qrCode: 'STU002-2026',
        status: 'printed',
    },
    {
        id: 'card-3',
        studentId: 'STU003',
        studentName: 'Amit Kumar',
        class: 'Class 8',
        section: 'A',
        rollNo: '22',
        dob: '2012-02-10',
        bloodGroup: 'B+',
        address: '789 Civil Lines, Jaipur',
        parentName: 'Ramesh Kumar',
        parentPhone: '9876543212',
        photo: '/placeholder-student.jpg',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        qrCode: 'STU003-2026',
        status: 'pending',
    },
];

// Mock Staff Cards
const mockStaffCards: StaffIDCard[] = [
    {
        id: 'staff-card-1',
        staffId: 'EMP001',
        staffName: 'Dr. Anita Sharma',
        designation: 'Principal',
        department: 'Administration',
        dob: '1975-03-15',
        bloodGroup: 'AB+',
        address: '100 School Colony, Delhi',
        phone: '9876543220',
        email: 'principal@school.edu',
        joiningDate: '2015-06-01',
        photo: '/placeholder-staff.jpg',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        qrCode: 'EMP001-2026',
        status: 'issued',
    },
    {
        id: 'staff-card-2',
        staffId: 'EMP002',
        staffName: 'Mr. Rajesh Gupta',
        designation: 'Mathematics Teacher',
        department: 'Academics',
        dob: '1985-07-20',
        bloodGroup: 'O-',
        address: '200 Teachers Quarters, Delhi',
        phone: '9876543221',
        email: 'rajesh@school.edu',
        joiningDate: '2018-04-01',
        photo: '/placeholder-staff.jpg',
        validFrom: '2026-04-01',
        validTo: '2027-03-31',
        qrCode: 'EMP002-2026',
        status: 'pending',
    },
];

export const IDCardService = {
    // Get templates
    getTemplates(type?: 'student' | 'staff'): IDCardTemplate[] {
        if (type) return mockTemplates.filter((t) => t.type === type);
        return mockTemplates;
    },

    // Get student cards
    getStudentCards(filters?: { class?: string; status?: string }): StudentIDCard[] {
        let result = [...mockStudentCards];
        if (filters?.class) result = result.filter((c) => c.class === filters.class);
        if (filters?.status) result = result.filter((c) => c.status === filters.status);
        return result;
    },

    // Get staff cards
    getStaffCards(filters?: { department?: string; status?: string }): StaffIDCard[] {
        let result = [...mockStaffCards];
        if (filters?.department) result = result.filter((c) => c.department === filters.department);
        if (filters?.status) result = result.filter((c) => c.status === filters.status);
        return result;
    },

    // Get card statistics
    getCardStats() {
        const studentCards = mockStudentCards;
        const staffCards = mockStaffCards;
        return {
            students: {
                total: studentCards.length,
                pending: studentCards.filter((c) => c.status === 'pending').length,
                printed: studentCards.filter((c) => c.status === 'printed').length,
                issued: studentCards.filter((c) => c.status === 'issued').length,
            },
            staff: {
                total: staffCards.length,
                pending: staffCards.filter((c) => c.status === 'pending').length,
                printed: staffCards.filter((c) => c.status === 'printed').length,
                issued: staffCards.filter((c) => c.status === 'issued').length,
            },
        };
    },

    // Generate QR code data
    generateQRData(id: string, type: 'student' | 'staff'): string {
        const year = new Date().getFullYear();
        return `${id}-${year}-${type.toUpperCase()}`;
    },

    // Classes list
    getClasses(): string[] {
        return ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
    },

    // Departments list
    getDepartments(): string[] {
        return ['Administration', 'Academics', 'Accounts', 'Sports', 'Library', 'IT', 'Maintenance'];
    },
};
