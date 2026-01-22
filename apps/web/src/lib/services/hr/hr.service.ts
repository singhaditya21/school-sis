/**
 * HR & Payroll Service
 * Manages staff, payroll, and leave
 */

export interface Staff {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: 'Male' | 'Female' | 'Other';
    department: 'TEACHING' | 'ADMIN' | 'ACCOUNTS' | 'TRANSPORT' | 'SUPPORT' | 'MANAGEMENT';
    designation: string;
    joiningDate: string;
    employmentType: 'PERMANENT' | 'CONTRACT' | 'PROBATION';
    status: 'ACTIVE' | 'ON_LEAVE' | 'RESIGNED' | 'TERMINATED';
    qualification: string;
    experience: number; // years
    salary: {
        basic: number;
        hra: number;
        da: number;
        ta: number;
        medical: number;
        pf: number;
        tax: number;
        gross: number;
        net: number;
    };
    bankDetails: {
        accountNumber: string;
        ifsc: string;
        bankName: string;
    };
    address: string;
    emergencyContact: string;
    photoUrl?: string;
}

export interface LeaveRequest {
    id: string;
    staffId: string;
    staffName: string;
    department: string;
    leaveType: 'CASUAL' | 'SICK' | 'EARNED' | 'MATERNITY' | 'PATERNITY' | 'UNPAID';
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    appliedOn: string;
    approvedBy?: string;
    comments?: string;
}

export interface LeaveBalance {
    staffId: string;
    casual: { total: number; used: number; balance: number };
    sick: { total: number; used: number; balance: number };
    earned: { total: number; used: number; balance: number };
}

export interface PayrollRecord {
    id: string;
    staffId: string;
    staffName: string;
    department: string;
    month: string;
    year: number;
    workingDays: number;
    daysPresent: number;
    basic: number;
    hra: number;
    da: number;
    ta: number;
    medical: number;
    otherAllowances: number;
    grossSalary: number;
    pf: number;
    tax: number;
    otherDeductions: number;
    totalDeductions: number;
    netSalary: number;
    status: 'DRAFT' | 'PROCESSED' | 'PAID';
    paidOn?: string;
}

// Mock staff data
export const mockStaff: Staff[] = [
    { id: 'st1', employeeId: 'EMP001', firstName: 'Dr. Anita', lastName: 'Sharma', email: 'anita.sharma@greenwood.edu', phone: '9876543210', dateOfBirth: '1980-05-15', gender: 'Female', department: 'TEACHING', designation: 'Principal', joiningDate: '2015-06-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'PhD Education', experience: 20, salary: { basic: 120000, hra: 48000, da: 12000, ta: 5000, medical: 3000, pf: 14400, tax: 15000, gross: 188000, net: 158600 }, bankDetails: { accountNumber: '1234567890', ifsc: 'SBIN0001234', bankName: 'State Bank' }, address: '123 MG Road, Bangalore', emergencyContact: '9876543211' },
    { id: 'st2', employeeId: 'EMP002', firstName: 'Rajesh', lastName: 'Kumar', email: 'rajesh.kumar@greenwood.edu', phone: '9876543212', dateOfBirth: '1985-08-20', gender: 'Male', department: 'TEACHING', designation: 'Senior Teacher', joiningDate: '2017-04-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'MSc Mathematics', experience: 12, salary: { basic: 65000, hra: 26000, da: 6500, ta: 3000, medical: 2000, pf: 7800, tax: 5000, gross: 102500, net: 89700 }, bankDetails: { accountNumber: '2345678901', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' }, address: '456 Park Street, Bangalore', emergencyContact: '9876543213' },
    { id: 'st3', employeeId: 'EMP003', firstName: 'Priya', lastName: 'Patel', email: 'priya.patel@greenwood.edu', phone: '9876543214', dateOfBirth: '1990-03-10', gender: 'Female', department: 'ACCOUNTS', designation: 'Accountant', joiningDate: '2019-01-15', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'MCom, CA Inter', experience: 8, salary: { basic: 55000, hra: 22000, da: 5500, ta: 2500, medical: 2000, pf: 6600, tax: 3000, gross: 87000, net: 77400 }, bankDetails: { accountNumber: '3456789012', ifsc: 'ICIC0001234', bankName: 'ICICI Bank' }, address: '789 Commercial Street, Bangalore', emergencyContact: '9876543215' },
    { id: 'st4', employeeId: 'EMP004', firstName: 'Suresh', lastName: 'Menon', email: 'suresh.menon@greenwood.edu', phone: '9876543216', dateOfBirth: '1982-11-25', gender: 'Male', department: 'TEACHING', designation: 'Teacher', joiningDate: '2018-07-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'MSc Physics', experience: 10, salary: { basic: 50000, hra: 20000, da: 5000, ta: 2500, medical: 1500, pf: 6000, tax: 2500, gross: 79000, net: 70500 }, bankDetails: { accountNumber: '4567890123', ifsc: 'AXIS0001234', bankName: 'Axis Bank' }, address: '321 Lake View, Bangalore', emergencyContact: '9876543217' },
    { id: 'st5', employeeId: 'EMP005', firstName: 'Kavita', lastName: 'Nair', email: 'kavita.nair@greenwood.edu', phone: '9876543218', dateOfBirth: '1988-07-08', gender: 'Female', department: 'TEACHING', designation: 'Teacher', joiningDate: '2020-02-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'MA English', experience: 6, salary: { basic: 45000, hra: 18000, da: 4500, ta: 2000, medical: 1500, pf: 5400, tax: 2000, gross: 71000, net: 63600 }, bankDetails: { accountNumber: '5678901234', ifsc: 'SBIN0005678', bankName: 'State Bank' }, address: '654 Green Park, Bangalore', emergencyContact: '9876543219' },
    { id: 'st6', employeeId: 'EMP006', firstName: 'Mohammed', lastName: 'Ali', email: 'mohammed.ali@greenwood.edu', phone: '9876543220', dateOfBirth: '1975-12-01', gender: 'Male', department: 'TRANSPORT', designation: 'Transport Manager', joiningDate: '2016-03-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'BA', experience: 15, salary: { basic: 40000, hra: 16000, da: 4000, ta: 3000, medical: 1500, pf: 4800, tax: 1500, gross: 64500, net: 58200 }, bankDetails: { accountNumber: '6789012345', ifsc: 'KOTAK0001234', bankName: 'Kotak Bank' }, address: '987 Transport Nagar, Bangalore', emergencyContact: '9876543221' },
    { id: 'st7', employeeId: 'EMP007', firstName: 'Lakshmi', lastName: 'Devi', email: 'lakshmi.devi@greenwood.edu', phone: '9876543222', dateOfBirth: '1992-09-15', gender: 'Female', department: 'ADMIN', designation: 'Office Assistant', joiningDate: '2021-06-01', employmentType: 'PERMANENT', status: 'ACTIVE', qualification: 'BCom', experience: 4, salary: { basic: 28000, hra: 11200, da: 2800, ta: 1500, medical: 1000, pf: 3360, tax: 0, gross: 44500, net: 41140 }, bankDetails: { accountNumber: '7890123456', ifsc: 'SBIN0009012', bankName: 'State Bank' }, address: '147 Residency Road, Bangalore', emergencyContact: '9876543223' },
    { id: 'st8', employeeId: 'EMP008', firstName: 'Arun', lastName: 'Verma', email: 'arun.verma@greenwood.edu', phone: '9876543224', dateOfBirth: '1995-04-20', gender: 'Male', department: 'TEACHING', designation: 'Junior Teacher', joiningDate: '2023-01-01', employmentType: 'PROBATION', status: 'ACTIVE', qualification: 'BTech, BEd', experience: 2, salary: { basic: 35000, hra: 14000, da: 3500, ta: 2000, medical: 1000, pf: 4200, tax: 0, gross: 55500, net: 51300 }, bankDetails: { accountNumber: '8901234567', ifsc: 'HDFC0005678', bankName: 'HDFC Bank' }, address: '258 Tech Park, Bangalore', emergencyContact: '9876543225' },
];

// Mock leave requests
export const mockLeaveRequests: LeaveRequest[] = [
    { id: 'lr1', staffId: 'st2', staffName: 'Rajesh Kumar', department: 'TEACHING', leaveType: 'CASUAL', startDate: '2026-01-25', endDate: '2026-01-27', days: 3, reason: 'Family function', status: 'PENDING', appliedOn: '2026-01-20' },
    { id: 'lr2', staffId: 'st5', staffName: 'Kavita Nair', department: 'TEACHING', leaveType: 'SICK', startDate: '2026-01-22', endDate: '2026-01-22', days: 1, reason: 'Not feeling well', status: 'APPROVED', appliedOn: '2026-01-21', approvedBy: 'Dr. Anita Sharma' },
    { id: 'lr3', staffId: 'st4', staffName: 'Suresh Menon', department: 'TEACHING', leaveType: 'EARNED', startDate: '2026-02-10', endDate: '2026-02-15', days: 6, reason: 'Annual vacation', status: 'PENDING', appliedOn: '2026-01-18' },
    { id: 'lr4', staffId: 'st7', staffName: 'Lakshmi Devi', department: 'ADMIN', leaveType: 'CASUAL', startDate: '2026-01-15', endDate: '2026-01-15', days: 1, reason: 'Personal work', status: 'APPROVED', appliedOn: '2026-01-14', approvedBy: 'Dr. Anita Sharma' },
    { id: 'lr5', staffId: 'st3', staffName: 'Priya Patel', department: 'ACCOUNTS', leaveType: 'SICK', startDate: '2026-01-10', endDate: '2026-01-11', days: 2, reason: 'Medical appointment', status: 'REJECTED', appliedOn: '2026-01-09', approvedBy: 'Dr. Anita Sharma', comments: 'Critical month-end closing' },
];

// Mock payroll
export const mockPayroll: PayrollRecord[] = mockStaff.filter(s => s.status === 'ACTIVE').map(staff => ({
    id: `pay-${staff.id}`,
    staffId: staff.id,
    staffName: `${staff.firstName} ${staff.lastName}`,
    department: staff.department,
    month: 'January',
    year: 2026,
    workingDays: 26,
    daysPresent: 24 + Math.floor(Math.random() * 2),
    basic: staff.salary.basic,
    hra: staff.salary.hra,
    da: staff.salary.da,
    ta: staff.salary.ta,
    medical: staff.salary.medical,
    otherAllowances: 0,
    grossSalary: staff.salary.gross,
    pf: staff.salary.pf,
    tax: staff.salary.tax,
    otherDeductions: 0,
    totalDeductions: staff.salary.pf + staff.salary.tax,
    netSalary: staff.salary.net,
    status: 'PROCESSED',
}));

/**
 * Get HR stats
 */
export function getHRStats() {
    const activeStaff = mockStaff.filter(s => s.status === 'ACTIVE');
    return {
        totalStaff: mockStaff.length,
        activeStaff: activeStaff.length,
        teaching: activeStaff.filter(s => s.department === 'TEACHING').length,
        nonTeaching: activeStaff.filter(s => s.department !== 'TEACHING').length,
        pendingLeaves: mockLeaveRequests.filter(l => l.status === 'PENDING').length,
        monthlyPayroll: mockPayroll.reduce((sum, p) => sum + p.netSalary, 0),
    };
}

/**
 * Calculate leave balance
 */
export function getLeaveBalance(staffId: string): LeaveBalance {
    const usedCasual = mockLeaveRequests.filter(l => l.staffId === staffId && l.leaveType === 'CASUAL' && l.status !== 'REJECTED').reduce((sum, l) => sum + l.days, 0);
    const usedSick = mockLeaveRequests.filter(l => l.staffId === staffId && l.leaveType === 'SICK' && l.status !== 'REJECTED').reduce((sum, l) => sum + l.days, 0);
    const usedEarned = mockLeaveRequests.filter(l => l.staffId === staffId && l.leaveType === 'EARNED' && l.status !== 'REJECTED').reduce((sum, l) => sum + l.days, 0);

    return {
        staffId,
        casual: { total: 12, used: usedCasual, balance: 12 - usedCasual },
        sick: { total: 10, used: usedSick, balance: 10 - usedSick },
        earned: { total: 15, used: usedEarned, balance: 15 - usedEarned },
    };
}
