import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getHealthStats, getIncidents } from '@/lib/actions/health';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { getImmunizationsDue, getMedicalAlerts, getStudentOptions } from './actions';
import HealthClient from './health-client';

function toIso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return typeof value === 'string' ? value : new Date().toISOString();
}

export default async function HealthPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const canWrite = hasPermission(session.role as UserRole, 'health:write');

    const [stats, rawIncidents, students, medicalAlerts, immunizationsDue] = await Promise.all([
        getHealthStats(),
        getIncidents(),
        canWrite ? getStudentOptions() : Promise.resolve([]),
        getMedicalAlerts(),
        getImmunizationsDue(),
    ]);

    const incidents = rawIncidents.slice(0, 100).map((incident) => ({
        id: String(incident.id),
        studentName: (incident.studentName as string | null) ?? null,
        type: String(incident.type),
        description: String(incident.description ?? ''),
        actionTaken: (incident.actionTaken as string | null) ?? null,
        incidentDate: toIso(incident.incidentDate),
        parentNotified: Boolean(incident.parentNotified),
    }));

    return (
        <HealthClient
            stats={stats}
            incidents={incidents}
            students={students}
            medicalAlerts={medicalAlerts}
            immunizationsDue={immunizationsDue}
            canWrite={canWrite}
        />
    );
}
