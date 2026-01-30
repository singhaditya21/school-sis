'use client';

import { useState } from 'react';

interface ExamResult {
    id: string;
    examName: string;
    term: string;
    subjects: SubjectMark[];
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
    grade: string;
    rank?: number;
}

interface SubjectMark {
    subject: string;
    maxMarks: number;
    obtainedMarks: number;
    grade: string;
}

// Mock data - will be replaced with API call
const mockResults: ExamResult[] = [
    {
        id: '1',
        examName: 'Mid-Term Examination',
        term: 'Term 1',
        subjects: [
            { subject: 'Mathematics', maxMarks: 100, obtainedMarks: 92, grade: 'A1' },
            { subject: 'Science', maxMarks: 100, obtainedMarks: 88, grade: 'A2' },
            { subject: 'English', maxMarks: 100, obtainedMarks: 85, grade: 'A2' },
            { subject: 'Hindi', maxMarks: 100, obtainedMarks: 78, grade: 'B1' },
            { subject: 'Social Science', maxMarks: 100, obtainedMarks: 82, grade: 'A2' },
        ],
        totalMarks: 500,
        obtainedMarks: 425,
        percentage: 85,
        grade: 'A',
        rank: 5,
    },
    {
        id: '2',
        examName: 'Unit Test 2',
        term: 'Term 1',
        subjects: [
            { subject: 'Mathematics', maxMarks: 50, obtainedMarks: 45, grade: 'A1' },
            { subject: 'Science', maxMarks: 50, obtainedMarks: 42, grade: 'A2' },
            { subject: 'English', maxMarks: 50, obtainedMarks: 40, grade: 'A2' },
        ],
        totalMarks: 150,
        obtainedMarks: 127,
        percentage: 84.67,
        grade: 'A',
    },
];

const gradeColors: Record<string, string> = {
    'A1': 'bg-emerald-100 text-emerald-700',
    'A2': 'bg-green-100 text-green-700',
    'B1': 'bg-blue-100 text-blue-700',
    'B2': 'bg-cyan-100 text-cyan-700',
    'C1': 'bg-yellow-100 text-yellow-700',
    'C2': 'bg-orange-100 text-orange-700',
    'D': 'bg-red-100 text-red-700',
    'A': 'bg-green-100 text-green-700',
    'B': 'bg-blue-100 text-blue-700',
    'C': 'bg-yellow-100 text-yellow-700',
};

export default function MyResultsPage() {
    const [selectedExam, setSelectedExam] = useState<ExamResult | null>(null);
    const [termFilter, setTermFilter] = useState<string>('all');

    const filteredResults = termFilter === 'all'
        ? mockResults
        : mockResults.filter(r => r.term === termFilter);

    const terms = [...new Set(mockResults.map(r => r.term))];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
                <p className="text-gray-600 mt-1">View your child&apos;s exam results and performance</p>
            </div>

            {/* Term Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <FilterButton
                    active={termFilter === 'all'}
                    onClick={() => setTermFilter('all')}
                >
                    All Terms
                </FilterButton>
                {terms.map((term) => (
                    <FilterButton
                        key={term}
                        active={termFilter === term}
                        onClick={() => setTermFilter(term)}
                    >
                        {term}
                    </FilterButton>
                ))}
            </div>

            {/* Results List */}
            <div className="space-y-4">
                {filteredResults.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
                        No results found for this term.
                    </div>
                ) : (
                    filteredResults.map((result) => (
                        <div
                            key={result.id}
                            className="bg-white rounded-xl shadow-sm border overflow-hidden"
                        >
                            {/* Exam Header */}
                            <button
                                onClick={() => setSelectedExam(selectedExam?.id === result.id ? null : result)}
                                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                            >
                                <div className="text-left">
                                    <h3 className="font-semibold text-gray-900">{result.examName}</h3>
                                    <p className="text-sm text-gray-500">{result.term}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-gray-900">{result.percentage.toFixed(1)}%</p>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${gradeColors[result.grade] || 'bg-gray-100'}`}>
                                            Grade {result.grade}
                                        </span>
                                    </div>
                                    <span className="text-gray-400">
                                        {selectedExam?.id === result.id ? '▲' : '▼'}
                                    </span>
                                </div>
                            </button>

                            {/* Expanded Subject Details */}
                            {selectedExam?.id === result.id && (
                                <div className="border-t bg-gray-50 p-4">
                                    {/* Summary */}
                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                        <div className="bg-white rounded-lg p-3 text-center">
                                            <p className="text-xs text-gray-500">Total</p>
                                            <p className="font-bold text-lg">{result.obtainedMarks}/{result.totalMarks}</p>
                                        </div>
                                        <div className="bg-white rounded-lg p-3 text-center">
                                            <p className="text-xs text-gray-500">Percentage</p>
                                            <p className="font-bold text-lg">{result.percentage.toFixed(1)}%</p>
                                        </div>
                                        {result.rank && (
                                            <div className="bg-white rounded-lg p-3 text-center">
                                                <p className="text-xs text-gray-500">Class Rank</p>
                                                <p className="font-bold text-lg">#{result.rank}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Subject-wise marks */}
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-gray-700">Subject-wise Marks</p>
                                        {result.subjects.map((subject, idx) => (
                                            <div
                                                key={idx}
                                                className="bg-white rounded-lg p-3 flex items-center justify-between"
                                            >
                                                <div>
                                                    <p className="font-medium text-gray-900">{subject.subject}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <p className="font-semibold">{subject.obtainedMarks}/{subject.maxMarks}</p>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${gradeColors[subject.grade] || 'bg-gray-100'}`}>
                                                        {subject.grade}
                                                    </span>
                                                    {/* Progress bar */}
                                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${(subject.obtainedMarks / subject.maxMarks) >= 0.9 ? 'bg-emerald-500' :
                                                                    (subject.obtainedMarks / subject.maxMarks) >= 0.75 ? 'bg-green-500' :
                                                                        (subject.obtainedMarks / subject.maxMarks) >= 0.6 ? 'bg-yellow-500' :
                                                                            'bg-red-500'
                                                                }`}
                                                            style={{ width: `${(subject.obtainedMarks / subject.maxMarks) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function FilterButton({
    children,
    active,
    onClick
}: {
    children: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`
                px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                ${active
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
            `}
        >
            {children}
        </button>
    );
}
