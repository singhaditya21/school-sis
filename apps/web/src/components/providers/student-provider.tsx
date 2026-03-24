'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Student {
    name: string;
    class?: string;
    id?: string;
}

interface StudentContextType {
    student: Student | null;
    isLoading: boolean;
}

const StudentContext = createContext<StudentContextType | undefined>(undefined);

export function StudentProvider({ children }: { children: ReactNode }) {
    // For now, using mock data as requested. In a real app, this would fetch from an API.
    const [student] = useState<Student>({
        name: 'Student Name',
        class: 'Grade 8 - Section A',
        id: 'student-1'
    });
    const [isLoading] = useState(false);

    return (
        <StudentContext.Provider value={{ student, isLoading }}>
            {children}
        </StudentContext.Provider>
    );
}

export function useStudent() {
    const context = useContext(StudentContext);
    if (context === undefined) {
        throw new Error('useStudent must be used within a StudentProvider');
    }
    return context;
}
