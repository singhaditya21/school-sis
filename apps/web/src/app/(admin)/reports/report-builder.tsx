'use client';

import { useState, useEffect } from 'react';
import { runDynamicReport, getReportSources } from '@/lib/actions/reports';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Database } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ReportBuilder() {
    const [sources, setSources] = useState<{ id: string, name: string, apiName: string }[]>([]);
    const [selectedSource, setSelectedSource] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [reportData, setReportData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getReportSources().then(res => {
            setSources(res);
            if (res.length > 0) setSelectedSource(res[0].apiName);
        });
    }, []);

    const handleGenerateReport = async () => {
        if (!selectedSource) return;
        setLoading(true);
        setError(null);
        
        try {
            const res = await runDynamicReport(selectedSource);
            if (res.success) {
                setReportData(res.data || []);
                setColumns(res.columns || []);
            } else {
                setError(res.error || 'Failed to generate report');
                setReportData([]);
                setColumns([]);
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (!reportData || reportData.length === 0) return;
        
        const escapeCsv = (val: any) => {
            if (val === null || val === undefined) return '""';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const header = columns.join(',');
        const rows = reportData.map(row => 
            columns.map(col => escapeCsv(row[col])).join(',')
        );
        
        const csvContent = [header, ...rows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${selectedSource}_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" /> Data Source
                    </CardTitle>
                    <CardDescription>Select a metadata object to query.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    <Select value={selectedSource} onValueChange={setSelectedSource}>
                        <SelectTrigger className="w-[300px]">
                            <SelectValue placeholder="Select Data Source" />
                        </SelectTrigger>
                        <SelectContent>
                            {sources.map(source => (
                                <SelectItem key={source.apiName} value={source.apiName}>
                                    {source.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleGenerateReport} disabled={loading || !selectedSource}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate Report
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <div className="p-4 rounded-md bg-red-50 text-red-700 border border-red-200">
                    {error}
                </div>
            )}

            {reportData.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div>
                            <CardTitle>Report Results</CardTitle>
                            <CardDescription>Showing {reportData.length} records</CardDescription>
                        </div>
                        <Button variant="outline" onClick={handleExportCSV}>
                            <Download className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="rounded-md border m-6 mt-0 overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {columns.map((col, i) => (
                                            <TableHead key={i} className="whitespace-nowrap">{col}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {columns.map((col, colIndex) => (
                                                <TableCell key={colIndex} className="max-w-[200px] truncate">
                                                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
