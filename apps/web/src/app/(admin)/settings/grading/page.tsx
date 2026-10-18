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
import { Plus, Settings, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
    getGradingSchemes,
    createGradingScheme,
    type GradingSchemeDTO as GradingScheme,
    type GradingSchemeType,
} from '@/lib/actions/grading';

export default function GradingSettingsPage() {
    const [schemes, setSchemes] = useState<GradingScheme[]>([]);
    const [selectedScheme, setSelectedScheme] = useState<GradingScheme | null>(null);
    const [, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newSchemeName, setNewSchemeName] = useState('');
    const [newSchemeType, setNewSchemeType] = useState<GradingSchemeType>('GPA');
    const [newSchemeDescription, setNewSchemeDescription] = useState('');
    const [testPercentage, setTestPercentage] = useState('');
    const [testResult, setTestResult] = useState<{ grade: string, gradePoint: number | null } | null>(null);

    useEffect(() => {
        void fetchSchemes();
    }, []);

    const fetchSchemes = async () => {
        setIsLoading(true);
        try {
            const response = await getGradingSchemes();
            const loadedSchemes = response.data ?? [];
            setSchemes(loadedSchemes);
            setSelectedScheme(loadedSchemes[0] || null);
            if (!response.success && response.error) {
                toast.error(response.error);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to fetch grading schemes');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateScheme = async () => {
        if (!newSchemeName.trim()) {
            toast.error('Please enter a scheme name.');
            return;
        }
        setIsSaving(true);
        try {
            const result = await createGradingScheme({
                name: newSchemeName,
                type: newSchemeType,
                description: newSchemeDescription,
            });
            if (result.success && result.data) {
                const updated = [result.data, ...schemes];
                setSchemes(updated);
                setSelectedScheme(result.data);
                setNewSchemeName('');
                setNewSchemeType('GPA');
                setNewSchemeDescription('');
                setIsDialogOpen(false);
                toast.success('Grading scheme created.');
            } else {
                toast.error(result.error ?? 'Failed to create grading scheme.');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create grading scheme');
        } finally {
            setIsSaving(false);
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

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Grading Settings</h1>
                    <p className="text-muted-foreground">
                        Configure grading schemes used for exams and report cards
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Scheme
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create Grading Scheme</DialogTitle>
                            <DialogDescription>
                                Define a new grading scheme with default grade thresholds
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="scheme-name">Scheme Name</Label>
                                    <Input
                                        id="scheme-name"
                                        placeholder="e.g., State Board Grading"
                                        value={newSchemeName}
                                        onChange={(e) => setNewSchemeName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Type</Label>
                                    <Select
                                        value={newSchemeType}
                                        onValueChange={(value) => setNewSchemeType(value as GradingSchemeType)}
                                    >
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
                                <Label htmlFor="scheme-description">Description</Label>
                                <Input
                                    id="scheme-description"
                                    placeholder="Brief description of this grading scheme"
                                    value={newSchemeDescription}
                                    onChange={(e) => setNewSchemeDescription(e.target.value)}
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreateScheme} disabled={isSaving}>
                                    {isSaving ? 'Creating...' : 'Create Scheme'}
                                </Button>
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
                                        : 'border-border hover:bg-muted'
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
                                        <Badge className="bg-muted text-foreground text-xs">Inactive</Badge>
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
                                <Button variant="outline" size="sm" disabled title="Grading schemes are not editable in this release">
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
