import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface Exam {
    id: string;
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    maxMarks: number;
    isActive: boolean;
    academicYear: { name: string };
    term?: { name: string };
    marksCount: number;
    schedulesCount: number;
}

// Mock exams data
const mockExams: Exam[] = [
    {
        id: 'e1',
        name: 'Term 1 Examination 2025-26',
        type: 'TERM_EXAM',
        startDate: '2025-09-15',
        endDate: '2025-09-30',
        maxMarks: 100,
        isActive: false,
        academicYear: { name: '2025-26' },
        term: { name: 'Term 1' },
        marksCount: 21600, // 4320 students × 5 subjects
        schedulesCount: 72
    },
    {
        id: 'e2',
        name: 'Mid-Term Assessment',
        type: 'MID_TERM',
        startDate: '2025-12-01',
        endDate: '2025-12-15',
        maxMarks: 50,
        isActive: true,
        academicYear: { name: '2025-26' },
        term: { name: 'Mid-Term' },
        marksCount: 8640,
        schedulesCount: 72
    },
    {
        id: 'e3',
        name: 'Term 2 Examination 2025-26',
        type: 'TERM_EXAM',
        startDate: '2026-03-01',
        endDate: '2026-03-15',
        maxMarks: 100,
        isActive: true,
        academicYear: { name: '2025-26' },
        term: { name: 'Term 2' },
        marksCount: 0,
        schedulesCount: 72
    },
    {
        id: 'e4',
        name: 'Class 10 Preboard Exam',
        type: 'FINAL',
        startDate: '2026-01-10',
        endDate: '2026-01-20',
        maxMarks: 80,
        isActive: true,
        academicYear: { name: '2025-26' },
        marksCount: 360 * 5,
        schedulesCount: 6
    },
    {
        id: 'e5',
        name: 'Class 12 Preboard Exam',
        type: 'FINAL',
        startDate: '2026-01-10',
        endDate: '2026-01-20',
        maxMarks: 80,
        isActive: true,
        academicYear: { name: '2025-26' },
        marksCount: 360 * 5,
        schedulesCount: 6
    },
    {
        id: 'e6',
        name: 'Unit Test 3 (Class 1-8)',
        type: 'UNIT_TEST',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        maxMarks: 25,
        isActive: true,
        academicYear: { name: '2025-26' },
        marksCount: 0,
        schedulesCount: 48
    }
];

export default async function ExamsPage() {
    const session = await getSession();

    // Fetch exams from Java API
    let exams: Exam[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/exams`,
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
            exams = data.data?.content || data.content || [];
            if (exams.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[Exams] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        exams = mockExams;
    }

    const activeExams = exams.filter((e) => e.isActive);
    const totalMarksEntered = exams.reduce((acc, e) => acc + (e.marksCount || 0), 0);

    const examTypeColors: Record<string, string> = {
        UNIT_TEST: 'bg-blue-100 text-blue-700',
        TERM_EXAM: 'bg-purple-100 text-purple-700',
        MID_TERM: 'bg-orange-100 text-orange-700',
        FINAL: 'bg-red-100 text-red-700',
        PRACTICAL: 'bg-green-100 text-green-700',
        PROJECT: 'bg-yellow-100 text-yellow-700',
        INTERNAL: 'bg-gray-100 text-gray-700',
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Exams & Gradebook</h1>
                    <p className="text-gray-600 mt-1">
                        Manage examinations, marks entry, and report cards
                    </p>
                </div>
                <Link
                    href="/exams/create"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + Create Exam
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Total Exams</p>
                    <p className="text-2xl font-bold text-gray-900">{exams.length}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Active Exams</p>
                    <p className="text-2xl font-bold text-blue-600">{activeExams.length}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Marks Entered</p>
                    <p className="text-2xl font-bold text-green-600">{totalMarksEntered}</p>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <p className="text-sm text-gray-500">Quick Actions</p>
                    <Link
                        href="/exams/marks"
                        className="text-blue-600 hover:underline text-sm"
                    >
                        Enter Marks →
                    </Link>
                </div>
            </div>

            {/* Exams List */}
            <div className="bg-white rounded-xl shadow-sm border">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-900">All Exams</h2>
                    <div className="flex gap-2">
                        <Link
                            href="/exams/report-cards"
                            className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50"
                        >
                            📄 Report Cards
                        </Link>
                    </div>
                </div>

                {exams.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-3">📝</div>
                        <p className="text-gray-500 mb-4">No exams created yet</p>
                        <Link
                            href="/exams/create"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Create Your First Exam
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y">
                        {exams.map((exam) => (
                            <Link
                                key={exam.id}
                                href={`/exams/${exam.id}`}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                                        <span className="text-xl">📝</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {exam.name}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {exam.academicYear?.name || 'N/A'}
                                            {exam.term && ` • ${exam.term.name}`}
                                            {' • '}
                                            {formatDate(exam.startDate)} - {formatDate(exam.endDate)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${examTypeColors[exam.type] || 'bg-gray-100 text-gray-700'
                                            }`}
                                    >
                                        {exam.type?.replace('_', ' ') || 'EXAM'}
                                    </span>
                                    <div className="text-right text-sm">
                                        <p className="text-gray-500">Max: {exam.maxMarks}</p>
                                        <p className="text-gray-400">{exam.marksCount || 0} marks entered</p>
                                    </div>
                                    <span className="text-gray-400">→</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
