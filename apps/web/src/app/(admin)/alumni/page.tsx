import { listAlumni, listAlumniEvents } from './actions';
import AlumniWorkspace from './alumni-workspace';

export default async function AlumniPage() {
    const [alumni, events] = await Promise.all([listAlumni(), listAlumniEvents()]);

    const verified = alumni.filter((a) => a.isVerified).length;
    const batches = new Set(alumni.map((a) => a.batch)).size;
    const upcoming = events.filter((e) => e.status === 'UPCOMING').length;
    const registrations = events.reduce((sum, e) => sum + e.registeredCount, 0);

    const stats = [
        { label: 'Total Alumni', value: alumni.length, className: 'text-primary' },
        { label: 'Verified', value: verified, className: 'text-success' },
        { label: 'Pending', value: alumni.length - verified, className: 'text-warning' },
        { label: 'Batches', value: batches, className: 'text-info' },
        { label: 'Upcoming Events', value: upcoming, className: 'text-primary' },
        { label: 'Registrations', value: registrations, className: 'text-success' },
    ];

    return <AlumniWorkspace alumni={alumni} events={events} stats={stats} />;
}
