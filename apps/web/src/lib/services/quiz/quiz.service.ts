// Quiz/Assessment Service for Online Examinations

export type QuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface QuizQuestion {
    id: string;
    text: string;
    type: QuestionType;
    options?: string[];
    correctAnswer: string | number;
    marks: number;
}

export interface Quiz {
    id: string;
    title: string;
    subject: string;
    class: string;
    section?: string;
    createdBy: string;
    duration: number; // minutes
    totalMarks: number;
    questions: QuizQuestion[];
    status: 'draft' | 'published' | 'closed';
    startTime?: string;
    endTime?: string;
    createdAt: string;
}

export interface QuizAttempt {
    id: string;
    quizId: string;
    studentId: string;
    studentName: string;
    answers: Record<string, string | number>;
    score: number;
    totalMarks: number;
    percentage: number;
    startedAt: string;
    submittedAt?: string;
    status: 'in_progress' | 'submitted' | 'graded';
}

// Mock Questions
const sampleQuestions: QuizQuestion[] = [
    {
        id: 'q1',
        text: 'What is the capital of India?',
        type: 'mcq',
        options: ['Mumbai', 'Delhi', 'Kolkata', 'Chennai'],
        correctAnswer: 1,
        marks: 2,
    },
    {
        id: 'q2',
        text: 'The Earth is flat.',
        type: 'true_false',
        options: ['True', 'False'],
        correctAnswer: 1,
        marks: 1,
    },
    {
        id: 'q3',
        text: 'What is 15 × 8?',
        type: 'mcq',
        options: ['100', '120', '130', '150'],
        correctAnswer: 1,
        marks: 2,
    },
    {
        id: 'q4',
        text: 'Name the process by which plants make food.',
        type: 'short_answer',
        correctAnswer: 'photosynthesis',
        marks: 3,
    },
    {
        id: 'q5',
        text: 'H2O is the chemical formula for water.',
        type: 'true_false',
        options: ['True', 'False'],
        correctAnswer: 0,
        marks: 1,
    },
];

// Mock Quizzes
const mockQuizzes: Quiz[] = [
    {
        id: 'quiz-1',
        title: 'Science Weekly Test',
        subject: 'Science',
        class: 'Class 8',
        section: 'A',
        createdBy: 'Dr. Sharma',
        duration: 30,
        totalMarks: 20,
        questions: sampleQuestions,
        status: 'published',
        startTime: '2026-01-22T10:00:00',
        endTime: '2026-01-22T11:00:00',
        createdAt: '2026-01-20',
    },
    {
        id: 'quiz-2',
        title: 'Mathematics Quiz - Chapter 5',
        subject: 'Mathematics',
        class: 'Class 9',
        createdBy: 'Mrs. Gupta',
        duration: 45,
        totalMarks: 30,
        questions: sampleQuestions,
        status: 'published',
        createdAt: '2026-01-21',
    },
    {
        id: 'quiz-3',
        title: 'English Grammar Test',
        subject: 'English',
        class: 'Class 7',
        createdBy: 'Mr. Kumar',
        duration: 20,
        totalMarks: 15,
        questions: sampleQuestions.slice(0, 3),
        status: 'draft',
        createdAt: '2026-01-22',
    },
    {
        id: 'quiz-4',
        title: 'History Unit Test',
        subject: 'Social Studies',
        class: 'Class 10',
        createdBy: 'Ms. Reddy',
        duration: 60,
        totalMarks: 50,
        questions: sampleQuestions,
        status: 'closed',
        createdAt: '2026-01-15',
    },
];

// Mock Attempts
const mockAttempts: QuizAttempt[] = [
    {
        id: 'att-1',
        quizId: 'quiz-1',
        studentId: 'STU001',
        studentName: 'Rahul Sharma',
        answers: { q1: 1, q2: 1, q3: 1, q4: 'photosynthesis', q5: 0 },
        score: 18,
        totalMarks: 20,
        percentage: 90,
        startedAt: '2026-01-22T10:05:00',
        submittedAt: '2026-01-22T10:28:00',
        status: 'graded',
    },
    {
        id: 'att-2',
        quizId: 'quiz-1',
        studentId: 'STU002',
        studentName: 'Priya Patel',
        answers: { q1: 1, q2: 0, q3: 2, q4: 'respiration', q5: 0 },
        score: 12,
        totalMarks: 20,
        percentage: 60,
        startedAt: '2026-01-22T10:02:00',
        submittedAt: '2026-01-22T10:30:00',
        status: 'graded',
    },
    {
        id: 'att-3',
        quizId: 'quiz-1',
        studentId: 'STU003',
        studentName: 'Amit Kumar',
        answers: { q1: 1, q2: 1, q3: 1, q4: 'photo synthesis', q5: 0 },
        score: 16,
        totalMarks: 20,
        percentage: 80,
        startedAt: '2026-01-22T10:08:00',
        submittedAt: '2026-01-22T10:25:00',
        status: 'graded',
    },
];

export const QuizService = {
    // Get all quizzes with optional filters
    getQuizzes(filters?: { subject?: string; class?: string; status?: string }): Quiz[] {
        let result = [...mockQuizzes];
        if (filters?.subject) {
            result = result.filter((q) => q.subject === filters.subject);
        }
        if (filters?.class) {
            result = result.filter((q) => q.class === filters.class);
        }
        if (filters?.status) {
            result = result.filter((q) => q.status === filters.status);
        }
        return result;
    },

    // Get quiz by ID
    getQuizById(id: string): Quiz | undefined {
        return mockQuizzes.find((q) => q.id === id);
    },

    // Get quiz statistics
    getQuizStats() {
        return {
            total: mockQuizzes.length,
            published: mockQuizzes.filter((q) => q.status === 'published').length,
            draft: mockQuizzes.filter((q) => q.status === 'draft').length,
            closed: mockQuizzes.filter((q) => q.status === 'closed').length,
        };
    },

    // Get attempts for a quiz
    getQuizAttempts(quizId: string): QuizAttempt[] {
        return mockAttempts.filter((a) => a.quizId === quizId);
    },

    // Get quiz results analytics
    getQuizAnalytics(quizId: string) {
        const attempts = this.getQuizAttempts(quizId);
        if (attempts.length === 0) return null;

        const scores = attempts.map((a) => a.percentage);
        return {
            totalAttempts: attempts.length,
            averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            highestScore: Math.max(...scores),
            lowestScore: Math.min(...scores),
            passed: attempts.filter((a) => a.percentage >= 40).length,
            failed: attempts.filter((a) => a.percentage < 40).length,
        };
    },

    // Calculate score for an attempt
    calculateScore(quiz: Quiz, answers: Record<string, string | number>): number {
        let score = 0;
        quiz.questions.forEach((q) => {
            const answer = answers[q.id];
            if (q.type === 'short_answer') {
                if (String(answer).toLowerCase().trim() === String(q.correctAnswer).toLowerCase()) {
                    score += q.marks;
                }
            } else if (answer === q.correctAnswer) {
                score += q.marks;
            }
        });
        return score;
    },

    // Subjects list
    getSubjects(): string[] {
        return ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science'];
    },

    // Classes list
    getClasses(): string[] {
        return ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];
    },
};
