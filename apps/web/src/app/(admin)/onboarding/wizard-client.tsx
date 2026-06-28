'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, School, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { completeOnboarding } from '@/lib/actions/onboarding-wizard';

const DEFAULT_GRADES = [
    'Nursery', 'LKG', 'UKG',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8',
    'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

export default function OnboardingWizardClient() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [academicYear, setAcademicYear] = useState('2025-2026');
    const [startDate, setStartDate] = useState('2025-04-01');
    const [endDate, setEndDate] = useState('2026-03-31');
    const [selectedGrades, setSelectedGrades] = useState<string[]>(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']);

    const handleToggleGrade = (grade: string) => {
        setSelectedGrades(prev => 
            prev.includes(grade) 
                ? prev.filter(g => g !== grade) 
                : [...prev, grade]
        );
    };

    const handleComplete = async () => {
        if (selectedGrades.length === 0) {
            setError('Please select at least one grade.');
            return;
        }

        setError('');
        setLoading(true);

        try {
            const res = await completeOnboarding({
                academicYear,
                startDate,
                endDate,
                grades: selectedGrades
            });

            if (res.error) {
                setError(res.error);
                setLoading(false);
            } else {
                router.push('/dashboard');
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
            setLoading(false);
        }
    };

    return (
        <Card className="shadow-lg border-0 ring-1 ring-slate-200 dark:ring-slate-800">
            {/* Stepper Header */}
            <div className="flex border-b border-slate-100 dark:border-slate-800">
                <div className={`flex-1 p-4 text-center border-r border-slate-100 dark:border-slate-800 transition-colors ${step === 1 ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600' : 'text-slate-500'}`}>
                    <div className="flex items-center justify-center gap-2">
                        <Calendar className="w-5 h-5" />
                        <span className="font-medium text-sm">1. Academic Year</span>
                    </div>
                </div>
                <div className={`flex-1 p-4 text-center transition-colors ${step === 2 ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600' : 'text-slate-500'}`}>
                    <div className="flex items-center justify-center gap-2">
                        <School className="w-5 h-5" />
                        <span className="font-medium text-sm">2. Grades & Classes</span>
                    </div>
                </div>
            </div>

            <CardContent className="p-8">
                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-start">
                        <span className="mr-2">⚠️</span> {error}
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Current Academic Year</h3>
                            <p className="text-sm text-slate-500">Set the active academic session for your school.</p>
                        </div>

                        <div className="grid gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="academicYear">Session Name</Label>
                                <Input 
                                    id="academicYear" 
                                    value={academicYear} 
                                    onChange={(e) => setAcademicYear(e.target.value)} 
                                    placeholder="e.g. 2025-2026"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="startDate">Start Date</Label>
                                    <Input 
                                        id="startDate" 
                                        type="date"
                                        value={startDate} 
                                        onChange={(e) => setStartDate(e.target.value)} 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="endDate">End Date</Label>
                                    <Input 
                                        id="endDate" 
                                        type="date"
                                        value={endDate} 
                                        onChange={(e) => setEndDate(e.target.value)} 
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Select Grades</h3>
                            <p className="text-sm text-slate-500">Choose the grades/classes offered at your institution.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                            {DEFAULT_GRADES.map((grade) => (
                                <div key={grade} className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                                    <Checkbox 
                                        id={`grade-${grade}`} 
                                        checked={selectedGrades.includes(grade)}
                                        onCheckedChange={() => handleToggleGrade(grade)}
                                    />
                                    <label
                                        htmlFor={`grade-${grade}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                    >
                                        {grade}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>

            <CardFooter className="px-8 py-4 bg-slate-50 dark:bg-slate-900/50 flex justify-between rounded-b-xl border-t border-slate-100 dark:border-slate-800">
                {step > 1 ? (
                    <Button variant="outline" onClick={() => setStep(step - 1)}>
                        Back
                    </Button>
                ) : (
                    <div /> // Spacer
                )}

                {step < 2 ? (
                    <Button onClick={() => setStep(step + 1)}>
                        Next Step <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                ) : (
                    <Button onClick={handleComplete} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Complete Setup
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
