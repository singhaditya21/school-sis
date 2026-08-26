import {
    listApaarStudents,
    listDigilockerCertificates,
    listDigilockerSyncAttempts,
} from './actions';
import DigilockerClient from './DigilockerClient';

export default async function DigiLockerPage() {
    const [students, certificates, syncAttempts] = await Promise.all([
        listApaarStudents(),
        listDigilockerCertificates(),
        listDigilockerSyncAttempts(),
    ]);

    return (
        <DigilockerClient
            students={students}
            certificates={certificates}
            syncAttempts={syncAttempts}
        />
    );
}
