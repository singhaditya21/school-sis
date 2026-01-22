'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Settings, Check, Star } from 'lucide-react';

interface GradeThreshold {
    id: string;
    minPercentage: number;
    maxPercentage: number;
    grade: string;
    gradePoint: number | null;
    remark: string;
    displayOrder: number;
}

interface GradingScheme {
    id: string;
    name: string;
    type: 'PERCENTAGE' | 'GPA' | 'CGPA' | 'LETTER';
    description: string;
    isDefault: boolean;
    isActive: boolean;
    thresholds: GradeThreshold[];
}

export default function GradingSettingsPage() {
    const [schemes, setSchemes] = useState<GradingScheme[]>([]);
    const [selectedScheme, setSelectedScheme] = useState<GradingScheme | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [testPercentage, setTestPercentage] = useState('');
    const [testResult, setTestResult] = useState<{ grade: string, gradePoint: number | null } | null>(null);

    useEffect(() => {
        fetchSchemes();
    }, []);

    const fetchSchemes = async () => {
        setIsLoading(true);
        try {
            // TODO: Replace with actual API call
            // const response = await fetch('/api/v1/grading-schemes');
            // const data = await response.json();

            // Demo CBSE scheme
            setSchemes([
                {
                    id: '1',
                    name: 'CBSE 9-Point Scale',
                    type: 'GPA',
                    description: 'Standard CBSE grading scheme for Classes 9-12',
                    isDefault: true,
                    isActive: true,
                    thresholds: [
                        { id: 't1', minPercentage: 91, maxPercentage: 100, grade: 'A1', gradePoint: 10.0, remark: 'Outstanding', displayOrder: 1 },
                        { id: 't2', minPercentage: 81, maxPercentage: 90, grade: 'A2', gradePoint: 9.0, remark: 'Excellent', displayOrder: 2 },
                        { id: 't3', minPercentage: 71, maxPercentage: 80, grade: 'B1', gradePoint: 8.0, remark: 'Very Good', displayOrder: 3 },
                        { id: 't4', minPercentage: 61, maxPercentage: 70, grade: 'B2', gradePoint: 7.0, remark: 'Good', displayOrder: 4 },
                        { id: 't5', minPercentage: 51, maxPercentage: 60, grade: 'C1', gradePoint: 6.0, remark: 'Above Average', displayOrder: 5 },
                        { id: 't6', minPercentage: 41, maxPercentage: 50, grade: 'C2', gradePoint: 5.0, remark: 'Average', displayOrder: 6 },
                        { id: 't7', minPercentage: 33, maxPercentage: 40, grade: 'D', gradePoint: 4.0, remark: 'Below Average', displayOrder: 7 },
                        { id: 't8', minPercentage: 0, maxPercentage: 32, grade: 'E', gradePoint: 0.0, remark: 'Needs Improvement', displayOrder: 8 },
                    ]
                },
                {
                    id: '2',
                    name: 'ICSE Percentage',
                    type: 'PERCENTAGE',
                    description: 'ICSE Board percentage-based grading',
                    isDefault: false,
                    isActive: true,
                    thresholds: [
                        { id: 't9', minPercentage: 90, maxPercentage: 100, grade: 'A+', gradePoint: null, remark: 'Distinction', displayOrder: 1 },
                        { id: 't10', minPercentage: 75, maxPercentage: 89, grade: 'A', gradePoint: null, remark: 'First Class', displayOrder: 2 },
                        { id: 't11', minPercentage: 60, maxPercentage: 74, grade: 'B', gradePoint: null, remark: 'Second Class', displayOrder: 3 },
                        { id: 't12', minPercentage: 45, maxPercentage: 59, grade: 'C', gradePoint: null, remark: 'Pass', displayOrder: 4 },
                        { id: 't13', minPercentage: 0, maxPercentage: 44, grade: 'F', gradePoint: null, remark: 'Fail', displayOrder: 5 },
                    ]
                }
            ]);

            // Set first scheme as selected
            setSelectedScheme(schemes[0] || null);
        } catch (error) {
            console.error('Failed to fetch grading schemes:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleTestGrade = () => {
        if (!selectedScheme || !testPercentage) return;

        const pct = parseFloat(testPercentage);
        const threshold = selectedScheme.thresholds.find(
            t => pct >= t.minPercentage && pct <= t.maxPercentage
        );

        if (threshold) {
            setTestResult({ grade: threshold.grade, gradePoint: threshold.gradePoint });
        } else {
            setTestResult(null);
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'GPA': return 'Grade Point Average';
            case 'CGPA': return 'Cumulative GPA';
            case 'PERCENTAGE': return 'Percentage Based';
            case 'LETTER': return 'Letter Grades';
            default: return type;
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Grading Settings</h1>
                    <p className="text-muted-foreground">
                        Configure grading schemes for exams and report cards
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Scheme
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create Grading Scheme</DialogTitle>
                            <DialogDescription>
                                Define a new grading scheme with grade thresholds
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Scheme Name</Label>
                                    <Input placeholder="e.g., State Board Grading" />
                                </div>
                                <div>
                                    <Label>Type</Label>
                                    <Select>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="GPA">GPA (Grade Points)</SelectItem>
                                            <SelectItem value="CGPA">CGPA (Cumulative)</SelectItem>
                                            <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                                            <SelectItem value="LETTER">Letter Grades</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Input placeholder="Brief description of this grading scheme" />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button>Create Scheme</Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Schemes List */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-lg">Grading Schemes</CardTitle>
                        <CardDescription>Select a scheme to view details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {schemes.map(scheme => (
                            <button
                                key={scheme.id}
                                onClick={() => setSelectedScheme(scheme)}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedScheme?.id === scheme.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{scheme.name}</span>
                                    {scheme.isDefault && (
                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                                        {scheme.type}
                                    </Badge>
                                    {scheme.isActive ? (
                                        <Badge className="bg-green-100 text-green-800 text-xs">Active</Badge>
                                    ) : (
                                        <Badge className="bg-gray-100 text-gray-800 text-xs">Inactive</Badge>
                                    )}
                                </div>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Scheme Details */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{selectedScheme?.name || 'Select a Scheme'}</CardTitle>
                                <CardDescription>
                                    {selectedScheme?.description || 'Choose a grading scheme from the list'}
                                </CardDescription>
                            </div>
                            {selectedScheme && (
                                <Button variant="outline" size="sm">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {selectedScheme ? (
                            <Tabs defaultValue="thresholds">
                                <TabsList>
                                    <TabsTrigger value="thresholds">Grade Thresholds</TabsTrigger>
                                    <TabsTrigger value="test">Test Calculator</TabsTrigger>
                                </TabsList>
                                <TabsContent value="thresholds" className="mt-4">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Grade</TableHead>
                                                <TableHead>Min %</TableHead>
                                                <TableHead>Max %</TableHead>
                                                {selectedScheme.type !== 'PERCENTAGE' && (
                                                    <TableHead>Grade Point</TableHead>
                                                )}
                                                <TableHead>Remark</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedScheme.thresholds.map(threshold => (
                                                <TableRow key={threshold.id}>
                                                    <TableCell className="font-medium">
                                                        <Badge variant="outline">{threshold.grade}</Badge>
                                                    </TableCell>
                                                    <TableCell>{threshold.minPercentage}%</TableCell>
                                                    <TableCell>{threshold.maxPercentage}%</TableCell>
                                                    {selectedScheme.type !== 'PERCENTAGE' && (
                                                        <TableCell>{threshold.gradePoint?.toFixed(1) || '-'}</TableCell>
                                                    )}
                                                    <TableCell className="text-muted-foreground">{threshold.remark}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                                <TabsContent value="test" className="mt-4">
                                    <div className="max-w-md space-y-4">
                                        <div>
                                            <Label>Enter Percentage to Test</Label>
                                            <div className="flex gap-2 mt-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={testPercentage}
                                                    onChange={(e) => setTestPercentage(e.target.value)}
                                                    placeholder="e.g., 75"
                                                />
                                                <Button onClick={handleTestGrade}>Calculate</Button>
                                            </div>
                                        </div>
                                        {testResult && (
                                            <Card className="bg-green-50 border-green-200">
                                                <CardContent className="pt-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-center">
                                                            <div className="text-3xl font-bold text-green-700">{testResult.grade}</div>
                                                            <div className="text-sm text-green-600">Grade</div>
                                                        </div>
                                                        {testResult.gradePoint !== null && (
                                                            <div className="text-center border-l border-green-300 pl-4">
                                                                <div className="text-3xl font-bold text-green-700">{testResult.gradePoint.toFixed(1)}</div>
                                                                <div className="text-sm text-green-600">Grade Point</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                Select a grading scheme to view its details
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
