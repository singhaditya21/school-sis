/**
 * Rank Computation Service
 * Calculates class and section ranks based on exam performance
 */

export interface StudentResult {
    studentId: string;
    studentName: string;
    section: string;
    totalMarks: number;
    maxMarks: number;
    percentage: number;
    classRank?: number;
    sectionRank?: number;
}

export interface RankComputationResult {
    examId: string;
    examName: string;
    classId: string;
    className: string;
    totalStudents: number;
    results: StudentResult[];
    topPerformers: StudentResult[];
    statistics: {
        highestMarks: number;
        lowestMarks: number;
        averageMarks: number;
        passPercentage: number;
    };
}

/**
 * Compute ranks for all students in a class for an exam
 * Handles tie-breaking: students with same marks get same rank
 */
export function computeRanks(results: StudentResult[]): StudentResult[] {
    if (results.length === 0) return [];

    // Sort by percentage descending
    const sorted = [...results].sort((a, b) => b.percentage - a.percentage);

    // Assign class ranks with tie handling
    let currentRank = 1;
    let previousPercentage = -1;
    let sameRankCount = 0;

    const rankedResults = sorted.map((student, index) => {
        if (student.percentage === previousPercentage) {
            // Same marks = same rank
            sameRankCount++;
        } else {
            // New rank = position (accounting for ties)
            currentRank = index + 1;
            sameRankCount = 0;
        }
        previousPercentage = student.percentage;

        return {
            ...student,
            classRank: currentRank,
        };
    });

    return rankedResults;
}

/**
 * Compute section-wise ranks within a class
 */
export function computeSectionRanks(results: StudentResult[]): StudentResult[] {
    // Group by section
    const sectionGroups: Record<string, StudentResult[]> = {};

    results.forEach(student => {
        if (!sectionGroups[student.section]) {
            sectionGroups[student.section] = [];
        }
        sectionGroups[student.section].push(student);
    });

    // Compute ranks within each section
    const rankedResults: StudentResult[] = [];

    Object.entries(sectionGroups).forEach(([section, students]) => {
        const sorted = [...students].sort((a, b) => b.percentage - a.percentage);

        let currentRank = 1;
        let previousPercentage = -1;

        sorted.forEach((student, index) => {
            if (student.percentage !== previousPercentage) {
                currentRank = index + 1;
            }
            previousPercentage = student.percentage;

            rankedResults.push({
                ...student,
                sectionRank: currentRank,
            });
        });
    });

    return rankedResults;
}

/**
 * Calculate statistics for a set of results
 */
export function calculateStatistics(results: StudentResult[], passingPercentage = 33): RankComputationResult['statistics'] {
    if (results.length === 0) {
        return {
            highestMarks: 0,
            lowestMarks: 0,
            averageMarks: 0,
            passPercentage: 0,
        };
    }

    const percentages = results.map(r => r.percentage);
    const passCount = results.filter(r => r.percentage >= passingPercentage).length;

    return {
        highestMarks: Math.max(...percentages),
        lowestMarks: Math.min(...percentages),
        averageMarks: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length * 10) / 10,
        passPercentage: Math.round((passCount / results.length) * 100 * 10) / 10,
    };
}

/**
 * Get top performers (top 3 by default)
 */
export function getTopPerformers(results: StudentResult[], count = 3): StudentResult[] {
    return [...results]
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, count);
}

/**
 * Full rank computation for a class
 */
export function computeFullRanks(
    examId: string,
    examName: string,
    classId: string,
    className: string,
    studentResults: StudentResult[]
): RankComputationResult {
    // Compute class ranks
    let results = computeRanks(studentResults);

    // Compute section ranks
    results = computeSectionRanks(results);

    return {
        examId,
        examName,
        classId,
        className,
        totalStudents: results.length,
        results,
        topPerformers: getTopPerformers(results),
        statistics: calculateStatistics(results),
    };
}

/**
 * Generate mock ranked results for demo
 */
export function generateMockRankedResults(classId: string, examName: string): RankComputationResult {
    const indianNames = [
        'Aarav Sharma', 'Ananya Gupta', 'Vivaan Patel', 'Diya Reddy', 'Arjun Singh',
        'Saanvi Jain', 'Krishna Menon', 'Kavya Nair', 'Ishaan Das', 'Priya Roy',
        'Dhruv Banerjee', 'Navya Kapoor', 'Atharva Kulkarni', 'Aanya Chopra', 'Kabir Mehta',
        'Kiara Shah', 'Reyansh Verma', 'Shanaya Kumar', 'Yuvan Saxena', 'Myra Agarwal',
    ];

    const sections = ['A', 'B', 'C'];

    const mockResults: StudentResult[] = indianNames.map((name, idx) => {
        const totalMarks = Math.floor(Math.random() * 200) + 300; // 300-500
        const maxMarks = 500;
        return {
            studentId: `s${idx + 1}`,
            studentName: name,
            section: sections[idx % 3],
            totalMarks,
            maxMarks,
            percentage: Math.round((totalMarks / maxMarks) * 100 * 10) / 10,
        };
    });

    return computeFullRanks(
        'exam-1',
        examName,
        classId,
        `Class ${classId}`,
        mockResults
    );
}
