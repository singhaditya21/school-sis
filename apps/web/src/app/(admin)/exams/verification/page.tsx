'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    Filter,
    RefreshCw
} from 'lucide-react';

interface PendingMark {
    markId: string;
    studentName: string;
    subject: string;
    marksObtained: number;
    maxMarks: number;
    enteredBy: string;
    enteredAt: string;
}

export default function MarksVerificationPage() {
    const [pendingMarks, setPendingMarks] = useState<PendingMark[]>([]);
    const [selectedMarks, setSelectedMarks] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({ pending: 0, verified: 0, rejected: 0 });

    // Mock data
    useEffect(() => {
        setPendingMarks([
            { markId: '1', studentName: 'Rahul Sharma', subject: 'Mathematics', marksObtained: 85, maxMarks: 100, enteredBy: 'Mr. Verma', enteredAt: '2026-01-20' },
            { markId: '2', studentName: 'Priya Patel', subject: 'Mathematics', marksObtained: 92, maxMarks: 100, enteredBy: 'Mr. Verma', enteredAt: '2026-01-20' },
            { markId: '3', studentName: 'Amit Kumar', subject: 'Science', marksObtained: 78, maxMarks: 100, enteredBy: 'Mrs. Gupta', enteredAt: '2026-01-20' },
            { markId: '4', studentName: 'Sneha Reddy', subject: 'Science', marksObtained: 88, maxMarks: 100, enteredBy: 'Mrs. Gupta', enteredAt: '2026-01-20' },
        ]);
        setStats({ pending: 156, verified: 892, rejected: 12 });
    }, []);

    const toggleMarkSelection = (markId: string) => {
        const newSelected = new Set(selectedMarks);
        if (newSelected.has(markId)) {
            newSelected.delete(markId);
        } else {
            newSelected.add(markId);
        }
        setSelectedMarks(newSelected);
    };

    const handleVerify = async () => {
        setIsLoading(true);
        // In production, call API
        await new Promise(resolve => setTimeout(resolve, 1000));
        setPendingMarks(prev => prev.filter(m => !selectedMarks.has(m.markId)));
        setSelectedMarks(new Set());
        setIsLoading(false);
    };

    const handleReject = async () => {
        setIsLoading(true);
        // In production, call API with rejection reason
        await new Promise(resolve => setTimeout(resolve, 1000));
        setPendingMarks(prev => prev.filter(m => !selectedMarks.has(m.markId)));
        setSelectedMarks(new Set());
        setIsLoading(false);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Marks Verification</h1>
                    <p className="text-muted-foreground">Review and approve marks entered by teachers</p>
                </div>
                <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter by Exam
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-amber-100 rounded-full">
                            <Clock className="h-6 w-6 text-amber-600" />
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">Pending Verification</div>
                            <div className="text-2xl font-bold">{stats.pending}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-green-100 rounded-full">
                            <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">Verified</div>
                            <div className="text-2xl font-bold">{stats.verified}</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-red-100 rounded-full">
                            <XCircle className="h-6 w-6 text-red-600" />
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">Rejected</div>
                            <div className="text-2xl font-bold">{stats.rejected}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Marks Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Pending Verification</CardTitle>
                            <CardDescription>Select marks to verify or reject</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={handleVerify}
                                disabled={selectedMarks.size === 0 || isLoading}
                            >
                                {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                Verify Selected ({selectedMarks.size})
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleReject}
                                disabled={selectedMarks.size === 0 || isLoading}
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <input
                                        type="checkbox"
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedMarks(new Set(pendingMarks.map(m => m.markId)));
                                            } else {
                                                setSelectedMarks(new Set());
                                            }
                                        }}
                                    />
                                </TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Marks</TableHead>
                                <TableHead>Entered By</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pendingMarks.map((mark) => (
                                <TableRow key={mark.markId}>
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            checked={selectedMarks.has(mark.markId)}
                                            onChange={() => toggleMarkSelection(mark.markId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{mark.studentName}</TableCell>
                                    <TableCell>{mark.subject}</TableCell>
                                    <TableCell>
                                        <span className="font-semibold">{mark.marksObtained}</span>
                                        <span className="text-muted-foreground">/{mark.maxMarks}</span>
                                    </TableCell>
                                    <TableCell>{mark.enteredBy}</TableCell>
                                    <TableCell>{mark.enteredAt}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700">
                                            <Clock className="h-3 w-3 mr-1" />
                                            Pending
                                        </Badge>
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
