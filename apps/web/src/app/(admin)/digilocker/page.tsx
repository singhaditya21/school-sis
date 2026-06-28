import { getDigilockerSyncLogs, getStudentsWithApaar } from '@/lib/actions/digilocker';
import DigilockerClient from './DigilockerClient';

export default async function DigiLockerPage() {
    const documents = await getDigilockerSyncLogs();
    const students = await getStudentsWithApaar();

    // Map documents to what client expects
    const formattedDocs = documents.map(d => ({
        id: d.id,
        studentId: d.studentId,
        studentName: d.studentName,
        studentLastName: d.studentLastName,
        documentType: d.documentType,
        documentNumber: d.documentNumber,
        issueDate: d.issueDate,
        status: d.status,
        aaparId: d.apaarId,
        digiLockerUri: d.digiLockerUri,
        errorMessage: d.errorMessage,
        pushedAt: d.syncAttemptedAt,
    }));

    return <DigilockerClient initialDocuments={formattedDocs} initialStudents={students} />;
}
