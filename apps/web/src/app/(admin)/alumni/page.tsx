import { listAlumni, listAlumniEvents } from './actions';
import AlumniWorkspace from './alumni-workspace';

export default async function AlumniPage() {
    const [alumni, events] = await Promise.all([listAlumni(), listAlumniEvents()]);

    const verified = alumni.filter((a) => a.isVerified).length;
    const batches = new Set(alumni.map((a) => a.batch)).size;
    const upcoming = events.filter((e) => e.status === 'UPCOMING').length;
    const registrations = events.reduce((sum, e) => sum + e.registeredCount, 0);

    const stats = [
        { label: 'Total Alumni', value: alumni.length, className: 'text-blue-600' },
        { label: 'Verified', value: verified, className: 'text-green-600' },
        { label: 'Pending', value: alumni.length - verified, className: 'text-orange-600' },
        { label: 'Batches', value: batches, className: 'text-purple-600' },
        { label: 'Upcoming Events', value: upcoming, className: 'text-indigo-600' },
        { label: 'Registrations', value: registrations, className: 'text-teal-600' },
    ];

    return <AlumniWorkspace alumni={alumni} events={events} stats={stats} />;
}
