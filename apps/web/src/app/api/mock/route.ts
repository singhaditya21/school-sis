import { NextRequest, NextResponse } from 'next/server';
import {
    getAllStudents,
    searchStudents,
    getStudentsByClass,
    generateDashboardStats,
    generateFeeStats,
    generateAttendanceStats,
    generateExamStats,
    generateHealthStats,
    generateClassList
} from '@/lib/mock-data';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'students';
    const query = searchParams.get('q') || '';
    const grade = searchParams.get('grade');
    const section = searchParams.get('section');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    try {
        switch (type) {
            case 'students': {
                let students;
                if (query) {
                    students = searchStudents(query);
                } else if (grade && section) {
                    students = getStudentsByClass(parseInt(grade), section);
                } else {
                    students = getAllStudents();
                }

                // Paginate
                const total = students.length;
                const start = (page - 1) * limit;
                const paginatedStudents = students.slice(start, start + limit);

                return NextResponse.json({
                    data: paginatedStudents,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                });
            }

            case 'classes': {
                const classes = generateClassList();
                return NextResponse.json({ data: classes });
            }

            case 'dashboard': {
                const stats = generateDashboardStats();
                return NextResponse.json({ data: stats });
            }

            case 'fees': {
                const stats = generateFeeStats();
                return NextResponse.json({ data: stats });
            }

            case 'attendance': {
                const stats = generateAttendanceStats();
                return NextResponse.json({ data: stats });
            }

            case 'exams': {
                const stats = generateExamStats();
                return NextResponse.json({ data: stats });
            }

            case 'health': {
                const stats = generateHealthStats();
                return NextResponse.json({ data: stats });
            }

            default:
                return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }
    } catch (error) {
        console.error('Mock data error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
