'use client';

import { useState, useEffect } from 'react';

export interface School {
    id: string;
    name: string;
    code: string;
    trustId: string;
    trustName: string;
    address: string;
    city: string;
    studentCount: number;
    staffCount: number;
    isActive: boolean;
}

interface SchoolSwitcherProps {
    currentSchool: School;
    schools?: School[];
    onSchoolChange: (school: School) => void;
}

export function SchoolSwitcher({ currentSchool, schools = [], onSchoolChange }: SchoolSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);

    const trustName = schools.length > 0 ? schools[0].trustName : currentSchool.trustName;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 transition-colors"
            >
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🏫</span>
                </div>
                <div className="text-left">
                    <div className="text-sm font-medium truncate max-w-40">{currentSchool.name}</div>
                    <div className="text-xs text-gray-500">{currentSchool.code}</div>
                </div>
                <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-72 bg-white border rounded-lg shadow-lg z-50">
                        <div className="p-2 border-b">
                            <div className="text-xs text-gray-500 uppercase font-medium px-2">{trustName}</div>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {schools.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-sm">No other schools available</div>
                            ) : (
                                schools.map(school => (
                                    <button
                                        key={school.id}
                                        onClick={() => { onSchoolChange(school); setIsOpen(false); }}
                                        className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors ${school.id === currentSchool.id ? 'bg-blue-50' : ''}`}
                                    >
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center">🏫</div>
                                        <div className="flex-1 text-left">
                                            <div className="text-sm font-medium">{school.name}</div>
                                            <div className="text-xs text-gray-500">{school.code} • {school.studentCount} students</div>
                                        </div>
                                        {school.id === currentSchool.id && (
                                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                        <div className="p-2 border-t">
                            <a href="/schools" className="block w-full text-center text-sm text-blue-600 hover:underline py-2">Manage Schools →</a>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default SchoolSwitcher;
