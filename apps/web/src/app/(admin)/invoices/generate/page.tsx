'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function GenerateInvoicesPage() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedGrades, setSelectedGrades] = useState<string[]>([]);

    const grades = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

    return (
        <div className="container mx-auto p-6 max-w-3xl">
            <div className="mb-6">
                <Link href="/invoices" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Generate Fee Invoices</CardTitle>
                    <CardDescription>
                        Create invoices for students based on fee plans
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Fee Plan</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select fee plan" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="q1">Q1 Tuition Fee</SelectItem>
                                    <SelectItem value="q2">Q2 Tuition Fee</SelectItem>
                                    <SelectItem value="q3">Q3 Tuition Fee</SelectItem>
                                    <SelectItem value="q4">Q4 Tuition Fee</SelectItem>
                                    <SelectItem value="annual">Annual Fee</SelectItem>
                                    <SelectItem value="transport">Transport Fee</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Due Date</Label>
                            <Input type="date" />
                        </div>
                    </div>

                    <div>
                        <Label className="mb-3 block">Select Grades</Label>
                        <div className="grid grid-cols-5 gap-3">
                            {grades.map(grade => (
                                <div key={grade} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`grade-${grade}`}
                                        checked={selectedGrades.includes(grade)}
                                        onCheckedChange={(checked) => {
                                            if (checked) {
                                                setSelectedGrades([...selectedGrades, grade]);
                                            } else {
                                                setSelectedGrades(selectedGrades.filter(g => g !== grade));
                                            }
                                        }}
                                    />
                                    <Label htmlFor={`grade-${grade}`} className="text-sm cursor-pointer">
                                        {grade.length > 2 ? grade : `Class ${grade}`}
                                    </Label>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="link"
                            className="mt-2 p-0 h-auto text-xs"
                            onClick={() => setSelectedGrades(selectedGrades.length === grades.length ? [] : [...grades])}
                        >
                            {selectedGrades.length === grades.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-medium text-blue-900 mb-2">Summary</h3>
                        <div className="text-sm text-blue-800 space-y-1">
                            <p>Grades Selected: <strong>{selectedGrades.length}</strong></p>
                            <p>Estimated Students: <strong>~{selectedGrades.length * 30}</strong></p>
                            <p>Estimated Invoices: <strong>~{selectedGrades.length * 30}</strong></p>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                        <Button
                            disabled={isGenerating || selectedGrades.length === 0}
                            onClick={() => setIsGenerating(true)}
                        >
                            {isGenerating ? 'Generating...' : 'Generate Invoices'}
                        </Button>
                        <Link href="/invoices">
                            <Button variant="outline">Cancel</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
