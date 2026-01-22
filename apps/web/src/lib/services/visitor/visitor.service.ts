// Visitor Management Service

export type VisitPurpose = 'meeting' | 'admission' | 'delivery' | 'interview' | 'parent_visit' | 'vendor' | 'other';

export interface Visitor {
    id: string;
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: VisitPurpose;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    photo?: string;
    idProof: string;
    idNumber: string;
    vehicleNumber?: string;
    checkInTime: string;
    checkOutTime?: string;
    status: 'checked_in' | 'checked_out' | 'pre_approved';
    visitorPass?: string;
    preApprovedBy?: string;
    preApprovedDate?: string;
}

export interface VisitorStats {
    todayTotal: number;
    currentlyIn: number;
    checkedOut: number;
    preApproved: number;
    averageVisitDuration: string;
}

// Mock Visitors
const mockVisitors: Visitor[] = [
    {
        id: 'v1',
        name: 'Mr. Suresh Kumar',
        phone: '9876543210',
        email: 'suresh@company.com',
        company: 'ABC Supplies Ltd',
        purpose: 'delivery',
        purposeDetails: 'Stationery delivery for admin office',
        hostName: 'Mrs. Priya Sharma',
        hostDepartment: 'Administration',
        idProof: 'Aadhaar Card',
        idNumber: '****1234',
        vehicleNumber: 'DL-01-AB-1234',
        checkInTime: '2026-01-22T09:30:00',
        status: 'checked_in',
        visitorPass: 'VP-001',
    },
    {
        id: 'v2',
        name: 'Mrs. Anita Singh',
        phone: '9876543211',
        purpose: 'parent_visit',
        purposeDetails: 'Meeting with class teacher regarding child performance',
        hostName: 'Mr. Rajesh Gupta',
        hostDepartment: 'Academics',
        idProof: 'Driving License',
        idNumber: '****5678',
        checkInTime: '2026-01-22T10:00:00',
        status: 'checked_in',
        visitorPass: 'VP-002',
    },
    {
        id: 'v3',
        name: 'Mr. Rahul Verma',
        phone: '9876543212',
        company: 'Tech Solutions',
        purpose: 'vendor',
        purposeDetails: 'IT equipment maintenance',
        hostName: 'Mr. Deepak IT',
        hostDepartment: 'IT',
        idProof: 'Company ID',
        idNumber: 'TECH-456',
        checkInTime: '2026-01-22T08:45:00',
        checkOutTime: '2026-01-22T11:30:00',
        status: 'checked_out',
        visitorPass: 'VP-003',
    },
    {
        id: 'v4',
        name: 'Dr. Meera Patel',
        phone: '9876543213',
        purpose: 'interview',
        purposeDetails: 'Teacher interview - Mathematics',
        hostName: 'Dr. Anita Sharma',
        hostDepartment: 'HR',
        idProof: 'PAN Card',
        idNumber: '****9012',
        checkInTime: '2026-01-22T14:00:00',
        status: 'pre_approved',
        preApprovedBy: 'HR Manager',
        preApprovedDate: '2026-01-20',
    },
    {
        id: 'v5',
        name: 'Mr. Vikram Joshi',
        phone: '9876543214',
        purpose: 'admission',
        purposeDetails: 'Admission inquiry for Class 6',
        hostName: 'Mrs. Kavita Admission',
        hostDepartment: 'Admissions',
        idProof: 'Voter ID',
        idNumber: '****3456',
        checkInTime: '2026-01-22T11:00:00',
        checkOutTime: '2026-01-22T12:15:00',
        status: 'checked_out',
        visitorPass: 'VP-004',
    },
];

export const VisitorService = {
    // Get all visitors with filters
    getVisitors(filters?: { status?: string; purpose?: string; date?: string }): Visitor[] {
        let result = [...mockVisitors];
        if (filters?.status) result = result.filter((v) => v.status === filters.status);
        if (filters?.purpose) result = result.filter((v) => v.purpose === filters.purpose);
        return result;
    },

    // Get currently checked-in visitors
    getActiveVisitors(): Visitor[] {
        return mockVisitors.filter((v) => v.status === 'checked_in');
    },

    // Get pre-approved visitors
    getPreApprovedVisitors(): Visitor[] {
        return mockVisitors.filter((v) => v.status === 'pre_approved');
    },

    // Get visitor stats
    getStats(): VisitorStats {
        const today = mockVisitors;
        return {
            todayTotal: today.length,
            currentlyIn: today.filter((v) => v.status === 'checked_in').length,
            checkedOut: today.filter((v) => v.status === 'checked_out').length,
            preApproved: today.filter((v) => v.status === 'pre_approved').length,
            averageVisitDuration: '1h 45m',
        };
    },

    // Get purpose options
    getPurposeOptions(): { value: VisitPurpose; label: string }[] {
        return [
            { value: 'meeting', label: 'Meeting' },
            { value: 'admission', label: 'Admission Inquiry' },
            { value: 'delivery', label: 'Delivery' },
            { value: 'interview', label: 'Interview' },
            { value: 'parent_visit', label: 'Parent Visit' },
            { value: 'vendor', label: 'Vendor/Service' },
            { value: 'other', label: 'Other' },
        ];
    },

    // Get departments
    getDepartments(): string[] {
        return ['Administration', 'Academics', 'Admissions', 'Accounts', 'HR', 'IT', 'Sports', 'Library'];
    },

    // Get ID proof types
    getIDProofTypes(): string[] {
        return ['Aadhaar Card', 'PAN Card', 'Driving License', 'Voter ID', 'Passport', 'Company ID', 'Other'];
    },

    // Generate visitor pass number
    generatePassNumber(): string {
        const num = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `VP-${num}`;
    },
};
