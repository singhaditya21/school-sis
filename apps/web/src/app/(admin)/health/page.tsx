'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Heart, Activity, Eye, Stethoscope, Plus, Search } from 'lucide-react';

interface HealthRecord {
    id: string;
    studentId: string;
    studentName?: string;
    academicYearId: string;
    checkupDate: string;
    height: number | null;
    weight: number | null;
    bmi: number | null;
    bmiCategory: string;
    bloodGroup: string | null;
    bloodGroupVerified: boolean;
    vision: string | null;
    dental: string | null;
    hearing: string | null;
    generalHealth: string | null;
    notes: string | null;
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    sectionName?: string;
}

export default function HealthRecordsPage() {
    const [records, setRecords] = useState<HealthRecord[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        height: '',
        weight: '',
        bloodGroup: '',
        vision: '',
        dental: '',
        hearing: '',
        generalHealth: '',
        notes: ''
    });

    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const healthStatuses = ['Normal', 'Needs Attention', 'Under Treatment', 'Requires Checkup'];

    useEffect(() => {
        // Fetch health records and students
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // TODO: Replace with actual API call
            // const response = await fetch('/api/v1/health-records/academic-years/{id}');
            // const data = await response.json();

            // Demo data - 20 students with Indian names (with blood group verification)
            setRecords([
                { id: '1', studentId: 's1', studentName: 'Aarav Sharma', academicYearId: 'ay1', checkupDate: '2026-01-15', height: 145, weight: 38, bmi: 18.1, bmiCategory: 'Normal', bloodGroup: 'B+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good overall health', notes: null },
                { id: '2', studentId: 's2', studentName: 'Priya Patel', academicYearId: 'ay1', checkupDate: '2026-01-15', height: 140, weight: 35, bmi: 17.9, bmiCategory: 'Normal', bloodGroup: 'O+', bloodGroupVerified: true, vision: 'Needs correction (6/12)', dental: 'Cavity detected', hearing: 'Normal', generalHealth: 'Recommend dental checkup', notes: 'Parents notified about vision' },
                { id: '3', studentId: 's3', studentName: 'Arjun Singh', academicYearId: 'ay1', checkupDate: '2026-01-15', height: 152, weight: 42, bmi: 18.2, bmiCategory: 'Normal', bloodGroup: 'A+', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Excellent', notes: null },
                { id: '4', studentId: 's4', studentName: 'Ananya Gupta', academicYearId: 'ay1', checkupDate: '2026-01-14', height: 138, weight: 32, bmi: 16.8, bmiCategory: 'Normal', bloodGroup: 'AB+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Braces fitted', hearing: 'Normal', generalHealth: 'Good', notes: 'Orthodontic treatment ongoing' },
                { id: '5', studentId: 's5', studentName: 'Vivaan Reddy', academicYearId: 'ay1', checkupDate: '2026-01-14', height: 148, weight: 48, bmi: 21.9, bmiCategory: 'Overweight', bloodGroup: 'B-', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Recommend diet consultation', notes: 'BMI above normal range' },
                { id: '6', studentId: 's6', studentName: 'Saanvi Jain', academicYearId: 'ay1', checkupDate: '2026-01-14', height: 135, weight: 28, bmi: 15.4, bmiCategory: 'Underweight', bloodGroup: 'O-', bloodGroupVerified: true, vision: 'Mild myopia (6/9)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Nutritional counseling recommended', notes: 'Parents informed' },
                { id: '7', studentId: 's7', studentName: 'Krishna Menon', academicYearId: 'ay1', checkupDate: '2026-01-13', height: 155, weight: 45, bmi: 18.7, bmiCategory: 'Normal', bloodGroup: 'A-', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Excellent', notes: null },
                { id: '8', studentId: 's8', studentName: 'Kavya Nair', academicYearId: 'ay1', checkupDate: '2026-01-13', height: 142, weight: 36, bmi: 17.9, bmiCategory: 'Normal', bloodGroup: 'AB-', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '9', studentId: 's9', studentName: 'Ishaan Das', academicYearId: 'ay1', checkupDate: '2026-01-13', height: 150, weight: 41, bmi: 18.2, bmiCategory: 'Normal', bloodGroup: 'B+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '10', studentId: 's10', studentName: 'Diya Roy', academicYearId: 'ay1', checkupDate: '2026-01-12', height: 137, weight: 30, bmi: 16.0, bmiCategory: 'Normal', bloodGroup: 'O+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '11', studentId: 's11', studentName: 'Dhruv Banerjee', academicYearId: 'ay1', checkupDate: '2026-01-12', height: 160, weight: 52, bmi: 20.3, bmiCategory: 'Normal', bloodGroup: 'A+', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '12', studentId: 's12', studentName: 'Navya Kapoor', academicYearId: 'ay1', checkupDate: '2026-01-12', height: 144, weight: 38, bmi: 18.3, bmiCategory: 'Normal', bloodGroup: 'B+', bloodGroupVerified: true, vision: 'Corrected with glasses', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: 'Regular eye checkup advised' },
                { id: '13', studentId: 's13', studentName: 'Atharva Kulkarni', academicYearId: 'ay1', checkupDate: '2026-01-11', height: 147, weight: 40, bmi: 18.5, bmiCategory: 'Normal', bloodGroup: 'O+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '14', studentId: 's14', studentName: 'Aanya Chopra', academicYearId: 'ay1', checkupDate: '2026-01-11', height: 140, weight: 34, bmi: 17.3, bmiCategory: 'Normal', bloodGroup: 'A+', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '15', studentId: 's15', studentName: 'Kabir Mehta', academicYearId: 'ay1', checkupDate: '2026-01-11', height: 158, weight: 55, bmi: 22.0, bmiCategory: 'Overweight', bloodGroup: 'B-', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Diet and exercise plan provided', notes: 'Follow-up in 3 months' },
                { id: '16', studentId: 's16', studentName: 'Kiara Shah', academicYearId: 'ay1', checkupDate: '2026-01-10', height: 136, weight: 31, bmi: 16.8, bmiCategory: 'Normal', bloodGroup: 'AB+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '17', studentId: 's17', studentName: 'Reyansh Verma', academicYearId: 'ay1', checkupDate: '2026-01-10', height: 153, weight: 44, bmi: 18.8, bmiCategory: 'Normal', bloodGroup: 'O-', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '18', studentId: 's18', studentName: 'Shanaya Kumar', academicYearId: 'ay1', checkupDate: '2026-01-10', height: 141, weight: 35, bmi: 17.6, bmiCategory: 'Normal', bloodGroup: 'A+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '19', studentId: 's19', studentName: 'Yuvan Saxena', academicYearId: 'ay1', checkupDate: '2026-01-09', height: 156, weight: 46, bmi: 18.9, bmiCategory: 'Normal', bloodGroup: 'B+', bloodGroupVerified: true, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
                { id: '20', studentId: 's20', studentName: 'Myra Agarwal', academicYearId: 'ay1', checkupDate: '2026-01-09', height: 139, weight: 33, bmi: 17.1, bmiCategory: 'Normal', bloodGroup: 'O+', bloodGroupVerified: false, vision: 'Normal (6/6)', dental: 'Normal', hearing: 'Normal', generalHealth: 'Good', notes: null },
            ]);

            setStudents([
                { id: 's1', firstName: 'Aarav', lastName: 'Sharma', admissionNumber: 'GWD2025001', sectionName: '1-A' },
                { id: 's2', firstName: 'Priya', lastName: 'Patel', admissionNumber: 'GWD2025002', sectionName: '1-A' },
                { id: 's3', firstName: 'Arjun', lastName: 'Singh', admissionNumber: 'GWD2025003', sectionName: '1-B' },
                { id: 's4', firstName: 'Ananya', lastName: 'Gupta', admissionNumber: 'GWD2025004', sectionName: '2-A' },
                { id: 's5', firstName: 'Vivaan', lastName: 'Reddy', admissionNumber: 'GWD2025005', sectionName: '2-B' },
                { id: 's6', firstName: 'Saanvi', lastName: 'Jain', admissionNumber: 'GWD2025006', sectionName: '3-A' },
                { id: 's7', firstName: 'Krishna', lastName: 'Menon', admissionNumber: 'GWD2025007', sectionName: '4-A' },
                { id: 's8', firstName: 'Kavya', lastName: 'Nair', admissionNumber: 'GWD2025008', sectionName: '4-B' },
                { id: 's9', firstName: 'Ishaan', lastName: 'Das', admissionNumber: 'GWD2025009', sectionName: '5-A' },
                { id: 's10', firstName: 'Diya', lastName: 'Roy', admissionNumber: 'GWD2025010', sectionName: '5-B' },
                { id: 's11', firstName: 'Dhruv', lastName: 'Banerjee', admissionNumber: 'GWD2025011', sectionName: '6-A' },
                { id: 's12', firstName: 'Navya', lastName: 'Kapoor', admissionNumber: 'GWD2025012', sectionName: '6-B' },
                { id: 's13', firstName: 'Atharva', lastName: 'Kulkarni', admissionNumber: 'GWD2025013', sectionName: '7-A' },
                { id: 's14', firstName: 'Aanya', lastName: 'Chopra', admissionNumber: 'GWD2025014', sectionName: '7-B' },
                { id: 's15', firstName: 'Kabir', lastName: 'Mehta', admissionNumber: 'GWD2025015', sectionName: '8-A' },
                { id: 's16', firstName: 'Kiara', lastName: 'Shah', admissionNumber: 'GWD2025016', sectionName: '8-B' },
                { id: 's17', firstName: 'Reyansh', lastName: 'Verma', admissionNumber: 'GWD2025017', sectionName: '9-A' },
                { id: 's18', firstName: 'Shanaya', lastName: 'Kumar', admissionNumber: 'GWD2025018', sectionName: '9-B' },
                { id: 's19', firstName: 'Yuvan', lastName: 'Saxena', admissionNumber: 'GWD2025019', sectionName: '10-A' },
                { id: 's20', firstName: 'Myra', lastName: 'Agarwal', admissionNumber: 'GWD2025020', sectionName: '10-B' },
            ]);
        } catch (error) {
            console.error('Failed to fetch health records:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent) return;

        try {
            // TODO: Replace with actual API call
            // await fetch('/api/v1/health-records', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ studentId: selectedStudent.id, ...formData })
            // });

            console.log('Saving health record:', { studentId: selectedStudent.id, ...formData });
            setIsDialogOpen(false);
            setFormData({ height: '', weight: '', bloodGroup: '', vision: '', dental: '', hearing: '', generalHealth: '', notes: '' });
            setSelectedStudent(null);
            fetchData();
        } catch (error) {
            console.error('Failed to save health record:', error);
        }
    };

    const getBmiStatusColor = (category: string) => {
        switch (category) {
            case 'Normal': return 'bg-green-100 text-green-800';
            case 'Underweight': return 'bg-yellow-100 text-yellow-800';
            case 'Overweight': return 'bg-orange-100 text-orange-800';
            case 'Obese': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const filteredRecords = records.filter(r =>
        r.studentName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Health Records</h1>
                    <p className="text-muted-foreground">
                        Student health and physical checkup records (CBSE HPC Compliance)
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Health Record
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Add Health Record</DialogTitle>
                            <DialogDescription>
                                Record student health and physical checkup data
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>Select Student</Label>
                                    <Select onValueChange={(value) => setSelectedStudent(students.find(s => s.id === value) || null)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose a student" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {students.map(student => (
                                                <SelectItem key={student.id} value={student.id}>
                                                    {student.firstName} {student.lastName} ({student.admissionNumber})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="height">Height (cm)</Label>
                                    <Input
                                        id="height"
                                        type="number"
                                        step="0.1"
                                        value={formData.height}
                                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                        placeholder="e.g., 145.5"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="weight">Weight (kg)</Label>
                                    <Input
                                        id="weight"
                                        type="number"
                                        step="0.1"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                        placeholder="e.g., 38.5"
                                    />
                                </div>

                                <div>
                                    <Label>Blood Group</Label>
                                    <Select onValueChange={(value) => setFormData({ ...formData, bloodGroup: value })}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select blood group" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {bloodGroups.map(bg => (
                                                <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label htmlFor="vision">Vision</Label>
                                    <Input
                                        id="vision"
                                        value={formData.vision}
                                        onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                                        placeholder="e.g., Normal (6/6)"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="dental">Dental</Label>
                                    <Input
                                        id="dental"
                                        value={formData.dental}
                                        onChange={(e) => setFormData({ ...formData, dental: e.target.value })}
                                        placeholder="e.g., Normal"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="hearing">Hearing</Label>
                                    <Input
                                        id="hearing"
                                        value={formData.hearing}
                                        onChange={(e) => setFormData({ ...formData, hearing: e.target.value })}
                                        placeholder="e.g., Normal"
                                    />
                                </div>

                                <div className="col-span-2">
                                    <Label htmlFor="generalHealth">General Health</Label>
                                    <Textarea
                                        id="generalHealth"
                                        value={formData.generalHealth}
                                        onChange={(e) => setFormData({ ...formData, generalHealth: e.target.value })}
                                        placeholder="Overall health observations..."
                                    />
                                </div>

                                <div className="col-span-2">
                                    <Label htmlFor="notes">Notes</Label>
                                    <Textarea
                                        id="notes"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Additional notes or follow-up required..."
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={!selectedStudent}>
                                    Save Record
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Checkups</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{records.length}</div>
                        <p className="text-xs text-muted-foreground">This academic year</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Coverage</CardTitle>
                        <Heart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Math.round((records.length / students.length) * 100)}%</div>
                        <p className="text-xs text-muted-foreground">Students checked</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Vision Issues</CardTitle>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {records.filter(r => r.vision && !r.vision.toLowerCase().includes('normal')).length}
                        </div>
                        <p className="text-xs text-muted-foreground">Need attention</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">BMI Concerns</CardTitle>
                        <Stethoscope className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {records.filter(r => r.bmiCategory !== 'Normal').length}
                        </div>
                        <p className="text-xs text-muted-foreground">Outside normal range</p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Records Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Health Records</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by student name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Height/Weight</TableHead>
                                <TableHead>BMI</TableHead>
                                <TableHead>Vision</TableHead>
                                <TableHead>Dental</TableHead>
                                <TableHead>Hearing</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRecords.map((record) => (
                                <TableRow key={record.id}>
                                    <TableCell className="font-medium">{record.studentName}</TableCell>
                                    <TableCell>{new Date(record.checkupDate).toLocaleDateString()}</TableCell>
                                    <TableCell>{record.height} cm / {record.weight} kg</TableCell>
                                    <TableCell>
                                        <Badge className={getBmiStatusColor(record.bmiCategory)}>
                                            {record.bmi?.toFixed(1)} ({record.bmiCategory})
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{record.vision || '-'}</TableCell>
                                    <TableCell>{record.dental || '-'}</TableCell>
                                    <TableCell>{record.hearing || '-'}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm">View</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
