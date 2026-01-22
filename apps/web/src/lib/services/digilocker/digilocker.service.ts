/**
 * DigiLocker Integration Service
 * Handles pushing certificates and documents to DigiLocker via NAD gateway
 */

export interface DigiLockerDocument {
    id: string;
    documentType: 'TRANSFER_CERTIFICATE' | 'CHARACTER_CERTIFICATE' | 'BONAFIDE_CERTIFICATE' | 'MIGRATION_CERTIFICATE' | 'REPORT_CARD' | 'MARKSHEET';
    studentId: string;
    studentName: string;
    aaparId?: string; // APAAR ID for linking
    documentNumber: string;
    issueDate: string;
    status: 'PENDING' | 'PUSHED' | 'VERIFIED' | 'FAILED';
    digiLockerUri?: string;
    errorMessage?: string;
    pushedAt?: string;
}

export interface DigiLockerStats {
    totalDocuments: number;
    pushed: number;
    pending: number;
    verified: number;
    failed: number;
    studentsLinked: number;
}

// Mock DigiLocker documents
export const mockDigiLockerDocuments: DigiLockerDocument[] = [
    { id: 'd1', documentType: 'TRANSFER_CERTIFICATE', studentId: 's1', studentName: 'Rahul Sharma', aaparId: 'APAAR123456789', documentNumber: 'TC/2026/001', issueDate: '2026-01-21', status: 'PUSHED', digiLockerUri: 'dl://TC-2026-001', pushedAt: '2026-01-21T10:30:00Z' },
    { id: 'd2', documentType: 'CHARACTER_CERTIFICATE', studentId: 's2', studentName: 'Priya Patel', aaparId: 'APAAR987654321', documentNumber: 'CC/2026/015', issueDate: '2026-01-19', status: 'VERIFIED', digiLockerUri: 'dl://CC-2026-015', pushedAt: '2026-01-19T14:20:00Z' },
    { id: 'd3', documentType: 'REPORT_CARD', studentId: 's3', studentName: 'Arjun Singh', aaparId: 'APAAR456789123', documentNumber: 'RC/2025-26/T1/003', issueDate: '2026-01-15', status: 'PUSHED', digiLockerUri: 'dl://RC-2025-T1-003', pushedAt: '2026-01-15T09:00:00Z' },
    { id: 'd4', documentType: 'BONAFIDE_CERTIFICATE', studentId: 's4', studentName: 'Ananya Gupta', documentNumber: 'BC/2026/023', issueDate: '2026-01-17', status: 'PENDING' },
    { id: 'd5', documentType: 'MIGRATION_CERTIFICATE', studentId: 's5', studentName: 'Vivaan Reddy', aaparId: 'APAAR111222333', documentNumber: 'MC/2026/007', issueDate: '2026-01-20', status: 'FAILED', errorMessage: 'APAAR ID verification failed' },
    { id: 'd6', documentType: 'MARKSHEET', studentId: 's6', studentName: 'Saanvi Jain', aaparId: 'APAAR444555666', documentNumber: 'MS/2025-26/T1/006', issueDate: '2026-01-16', status: 'VERIFIED', digiLockerUri: 'dl://MS-2025-T1-006', pushedAt: '2026-01-16T11:45:00Z' },
];

// Students with APAAR IDs
export const studentsWithAPAAR = [
    { studentId: 's1', studentName: 'Rahul Sharma', aaparId: 'APAAR123456789', verified: true },
    { studentId: 's2', studentName: 'Priya Patel', aaparId: 'APAAR987654321', verified: true },
    { studentId: 's3', studentName: 'Arjun Singh', aaparId: 'APAAR456789123', verified: true },
    { studentId: 's4', studentName: 'Ananya Gupta', aaparId: null, verified: false },
    { studentId: 's5', studentName: 'Vivaan Reddy', aaparId: 'APAAR111222333', verified: false },
    { studentId: 's6', studentName: 'Saanvi Jain', aaparId: 'APAAR444555666', verified: true },
    { studentId: 's7', studentName: 'Krishna Menon', aaparId: 'APAAR777888999', verified: true },
    { studentId: 's8', studentName: 'Kavya Nair', aaparId: null, verified: false },
];

/**
 * Get DigiLocker statistics
 */
export function getDigiLockerStats(): DigiLockerStats {
    return {
        totalDocuments: mockDigiLockerDocuments.length,
        pushed: mockDigiLockerDocuments.filter(d => d.status === 'PUSHED').length,
        pending: mockDigiLockerDocuments.filter(d => d.status === 'PENDING').length,
        verified: mockDigiLockerDocuments.filter(d => d.status === 'VERIFIED').length,
        failed: mockDigiLockerDocuments.filter(d => d.status === 'FAILED').length,
        studentsLinked: studentsWithAPAAR.filter(s => s.verified).length,
    };
}

/**
 * Simulate pushing document to DigiLocker
 */
export async function pushToDigiLocker(documentId: string): Promise<{ success: boolean; uri?: string; error?: string }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const doc = mockDigiLockerDocuments.find(d => d.id === documentId);
    if (!doc) {
        return { success: false, error: 'Document not found' };
    }

    // Check if student has APAAR ID
    const student = studentsWithAPAAR.find(s => s.studentId === doc.studentId);
    if (!student?.aaparId) {
        return { success: false, error: 'Student APAAR ID not linked' };
    }

    // Simulate 90% success rate
    if (Math.random() > 0.1) {
        const uri = `dl://${doc.documentType.toLowerCase().replace('_', '-')}-${doc.documentNumber.replace(/\//g, '-')}`;
        return { success: true, uri };
    } else {
        return { success: false, error: 'DigiLocker API temporarily unavailable' };
    }
}

/**
 * Verify APAAR ID
 */
export async function verifyAPAARId(studentId: string, aaparId: string): Promise<{ success: boolean; message: string }> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Validate format (APAAR followed by 9 digits)
    if (!/^APAAR\d{9}$/.test(aaparId)) {
        return { success: false, message: 'Invalid APAAR ID format. Expected: APAAR followed by 9 digits' };
    }

    // Simulate 95% success rate
    if (Math.random() > 0.05) {
        return { success: true, message: 'APAAR ID verified successfully' };
    } else {
        return { success: false, message: 'APAAR ID not found in national database' };
    }
}

/**
 * Get document types for DigiLocker
 */
export const DIGILOCKER_DOCUMENT_TYPES = [
    { value: 'TRANSFER_CERTIFICATE', label: 'Transfer Certificate (TC)', code: 'TC' },
    { value: 'CHARACTER_CERTIFICATE', label: 'Character Certificate', code: 'CC' },
    { value: 'BONAFIDE_CERTIFICATE', label: 'Bonafide Certificate', code: 'BC' },
    { value: 'MIGRATION_CERTIFICATE', label: 'Migration Certificate', code: 'MC' },
    { value: 'REPORT_CARD', label: 'Report Card', code: 'RC' },
    { value: 'MARKSHEET', label: 'Marksheet', code: 'MS' },
];
