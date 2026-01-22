import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface TimetableSlot {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    subject: { name: string };
    teacher: { name: string };
    classGroup: { name: string };
}

interface ClassGroup {
    id: string;
    name: string;
    section: { name: string; grade: { name: string } };
    studentCount: number;
}

// Mock class groups (72 total)
const mockClassGroups: ClassGroup[] = [];
const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
for (let grade = 1; grade <= 12; grade++) {
    for (const section of sections) {
        mockClassGroups.push({
            id: `class-${grade}-${section}`,
            name: `Class ${grade}-${section}`,
            section: {
                name: section,
                grade: { name: `Class ${grade}` }
            },
            studentCount: 60
        });
    }
}

export default async function TimetablePage() {
    const session = await getSession();

    // Fetch class groups from Java API
    let classGroups: ClassGroup[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/timetable/classes`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            classGroups = data.data?.content || data.content || [];
            if (classGroups.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Timetable] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        classGroups = mockClassGroups;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Timetable</h1>
                    <p className="text-gray-600 mt-1">Manage class schedules and periods</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        href="/timetable/grid"
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        📅 Grid View
                    </Link>
                    <Link
                        href="/timetable/new"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        + Add Period
                    </Link>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b">
                    <h2 className="font-semibold text-gray-900">Classes</h2>
                </div>
                <div className="divide-y">
                    {classGroups.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No classes found. Configure classes first.
                        </div>
                    ) : (
                        classGroups.map((classGroup) => (
                            <Link
                                key={classGroup.id}
                                href={`/timetable/${classGroup.id}`}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-700 font-bold">
                                        {classGroup.section?.grade?.name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {classGroup.section?.grade?.name || 'Class'} - {classGroup.section?.name || 'Section'}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {classGroup.studentCount || 0} students
                                        </p>
                                    </div>
                                </div>
                                <span className="text-gray-400">→</span>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
