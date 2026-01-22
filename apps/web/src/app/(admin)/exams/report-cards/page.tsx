import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface ClassGroup {
    id: string;
    name: string;
    grade: string;
    section: string;
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
            grade: `Class ${grade}`,
            section,
            studentCount: 60,
        });
    }
}

export default async function ReportCardsPage() {
    const session = await getSession();

    let classGroups: ClassGroup[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/classes`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
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
        console.error('[ReportCards] API Error, using mock data:', error);
        useMockData = true;
    }

    if (useMockData) {
        classGroups = mockClassGroups;
    }

    // Group classes by grade
    const gradeGroups: Record<string, ClassGroup[]> = {};
    classGroups.forEach(c => {
        const grade = c.grade || `Class ${c.name.split('-')[0].replace('Class ', '')}`;
        if (!gradeGroups[grade]) gradeGroups[grade] = [];
        gradeGroups[grade].push(c);
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Report Cards</h1>
                    <p className="text-gray-600 mt-1">Generate and view student report cards with ranks</p>
                </div>
                <Link href="/exams" className="text-blue-600 hover:underline">← Back to Exams</Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Total Classes</div>
                    <div className="text-2xl font-bold text-blue-600">{classGroups.length}</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Total Students</div>
                    <div className="text-2xl font-bold text-green-600">{classGroups.reduce((sum, c) => sum + (c.studentCount || 60), 0).toLocaleString()}</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Reports Generated</div>
                    <div className="text-2xl font-bold text-purple-600">3,480</div>
                    <div className="text-xs text-gray-400">Term 1 Completed</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="text-sm text-gray-500">Pending</div>
                    <div className="text-2xl font-bold text-orange-600">840</div>
                    <div className="text-xs text-gray-400">Mid-Term in progress</div>
                </div>
            </div>

            {/* Class Selection */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="font-semibold">Select Class to View Ranks & Report Cards</h2>
                    <span className="text-sm text-gray-500">Click a class to see student rankings</span>
                </div>

                <div className="p-4">
                    {Object.entries(gradeGroups).slice(0, 12).map(([grade, classes]) => (
                        <div key={grade} className="mb-4">
                            <h3 className="text-sm font-medium text-gray-700 mb-2">{grade}</h3>
                            <div className="flex flex-wrap gap-2">
                                {classes.map((c) => (
                                    <Link
                                        key={c.id}
                                        href={`/exams/report-cards/${c.id}`}
                                        className="px-4 py-2 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        {c.section || c.name}
                                        <span className="text-xs text-gray-500 ml-1">({c.studentCount || 60})</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
