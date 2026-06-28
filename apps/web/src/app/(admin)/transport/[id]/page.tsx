import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getRouteDetail } from '@/lib/actions/transport';
import { pool } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import AssignStudentForm from './assign-student-form';

export default async function RouteDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('transport:read');
    } catch (e) {
        redirect('/unauthorized');
    }

    const { id } = await params;

    // Validate UUID format before querying to avoid PG errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        redirect('/transport');
    }

    const routeDetail = await getRouteDetail(id);
    if (!routeDetail) {
        redirect('/transport');
    }

    const { tenantId } = await requireAuth('transport:read');

    // Fetch assigned students
    const { rows: studentRows } = await pool.query(`
        SELECT st.id, s.first_name || ' ' || s.last_name AS "studentName", s.id AS "studentId", stop.name AS "stopName"
        FROM student_transport st
        INNER JOIN students s ON st.student_id = s.id
        INNER JOIN stops stop ON st.stop_id = stop.id
        WHERE st.route_id = $1 AND st.tenant_id = $2
    `, [id, tenantId]);

    const { route, stops } = routeDetail;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/transport" className="text-blue-600 hover:underline">
                    ← Back to Transport
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                        🚌
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900" data-testid="route-name-title">{route.name}</h1>
                        <p className="text-gray-500" data-testid="route-vehicle">Vehicle: {route.vehicleNumber}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-4 border-t">
                    <div>
                        <span className="text-gray-500 block">Morning Departure</span>
                        <span className="font-semibold">{route.morningDepartureTime || '07:00'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block">Afternoon Departure</span>
                        <span className="font-semibold">{route.afternoonDepartureTime || '15:00'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block">Monthly Fee</span>
                        <span className="font-semibold">{route.monthlyFee ? formatCurrency(Number(route.monthlyFee)) : 'N/A'}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block">Total Stops</span>
                        <span className="font-semibold">{route.stopCount}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stops List */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-bold text-lg mb-4">Stops</h3>
                    {stops.length === 0 ? (
                        <p className="text-gray-500 italic">No stops configured for this route.</p>
                    ) : (
                        <div className="space-y-3">
                            {stops.map((stop) => (
                                <div key={stop.id} className="flex justify-between items-center border-b pb-2 last:border-0" data-testid="stop-item">
                                    <div>
                                        <p className="font-semibold text-sm">{stop.name}</p>
                                        {stop.address && <p className="text-xs text-gray-400">{stop.address}</p>}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Order: {stop.displayOrder}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Assign Student Form */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h3 className="font-bold text-lg mb-4">Assign Student</h3>
                    <AssignStudentForm routeId={id} stops={stops} />
                </div>
            </div>

            {/* Assigned Students List */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-bold text-lg mb-4">Assigned Students ({studentRows.length})</h3>
                {studentRows.length === 0 ? (
                    <p className="text-gray-500 italic" data-testid="no-students-placeholder">No students assigned to this route yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                                    <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Stop Name</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {studentRows.map((row) => (
                                    <tr key={row.id} data-testid="assigned-student-row">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{row.studentName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-mono text-xs">{row.studentId}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.stopName}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
