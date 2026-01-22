/**
 * Analytics Service
 * Generates mock data for charts and reports
 */

export interface ChartDataPoint {
    label: string;
    value: number;
    previousValue?: number;
}

export interface FeeCollectionData {
    month: string;
    collected: number;
    target: number;
    pending: number;
}

export interface AttendanceData {
    date: string;
    present: number;
    absent: number;
    percentage: number;
}

export interface ExamPerformanceData {
    class: string;
    section: string;
    averagePercent: number;
    passPercent: number;
    topScore: number;
}

export interface AnalyticsSummary {
    totalStudents: number;
    totalFeeCollected: number;
    averageAttendance: number;
    averageExamScore: number;
    monthlyGrowth: number;
    pendingFees: number;
}

// Generate monthly fee collection data
export function generateFeeCollectionData(months = 12): FeeCollectionData[] {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();

    return monthNames.slice(0, currentMonth + 1).map((month, idx) => {
        const target = 1500000 + Math.random() * 500000;
        const collected = target * (0.7 + Math.random() * 0.25);
        return {
            month,
            collected: Math.round(collected),
            target: Math.round(target),
            pending: Math.round(target - collected),
        };
    });
}

// Generate weekly attendance data
export function generateAttendanceData(weeks = 8): AttendanceData[] {
    const data: AttendanceData[] = [];
    const today = new Date();

    for (let i = weeks - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - (i * 7));

        const total = 4320;
        const presentPercent = 85 + Math.random() * 10;
        const present = Math.round(total * presentPercent / 100);

        data.push({
            date: date.toISOString().split('T')[0],
            present,
            absent: total - present,
            percentage: Math.round(presentPercent * 10) / 10,
        });
    }

    return data;
}

// Generate exam performance by class
export function generateExamPerformanceData(): ExamPerformanceData[] {
    const data: ExamPerformanceData[] = [];
    const sections = ['A', 'B', 'C'];

    for (let grade = 1; grade <= 12; grade++) {
        for (const section of sections) {
            data.push({
                class: `${grade}`,
                section,
                averagePercent: Math.round((55 + Math.random() * 30) * 10) / 10,
                passPercent: Math.round((80 + Math.random() * 18) * 10) / 10,
                topScore: Math.round(85 + Math.random() * 15),
            });
        }
    }

    return data;
}

// Generate class-wise summary for charts
export function generateClassWiseSummary(): ChartDataPoint[] {
    return Array.from({ length: 12 }, (_, i) => ({
        label: `Class ${i + 1}`,
        value: Math.round(60 + Math.random() * 30),
        previousValue: Math.round(55 + Math.random() * 30),
    }));
}

// Get analytics summary
export function getAnalyticsSummary(): AnalyticsSummary {
    const feeData = generateFeeCollectionData();
    const totalCollected = feeData.reduce((sum, d) => sum + d.collected, 0);
    const totalPending = feeData.reduce((sum, d) => sum + d.pending, 0);

    return {
        totalStudents: 4320,
        totalFeeCollected: totalCollected,
        averageAttendance: 91.5,
        averageExamScore: 72.3,
        monthlyGrowth: 8.5,
        pendingFees: totalPending,
    };
}

// Generate subject-wise performance
export function generateSubjectPerformance(): ChartDataPoint[] {
    const subjects = ['Mathematics', 'Science', 'English', 'Hindi', 'Social Studies', 'Computer'];
    return subjects.map(subject => ({
        label: subject,
        value: Math.round(60 + Math.random() * 30),
        previousValue: Math.round(55 + Math.random() * 30),
    }));
}

// Generate daily attendance for heatmap (last 30 days)
export function generateDailyAttendance(): { date: string; value: number }[] {
    const data: { date: string; value: number }[] = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        data.push({
            date: date.toISOString().split('T')[0],
            value: Math.round(85 + Math.random() * 12),
        });
    }

    return data;
}

// Top performers
export function getTopPerformers(): { name: string; class: string; percentage: number }[] {
    const names = [
        'Aarav Sharma', 'Priya Patel', 'Arjun Singh', 'Ananya Gupta', 'Vivaan Reddy',
        'Saanvi Jain', 'Krishna Menon', 'Kavya Nair', 'Ishaan Das', 'Diya Roy'
    ];

    return names.map((name, idx) => ({
        name,
        class: `${10 + Math.floor(idx / 3)}-${['A', 'B', 'C'][idx % 3]}`,
        percentage: Math.round((95 - idx * 1.5) * 10) / 10,
    }));
}
