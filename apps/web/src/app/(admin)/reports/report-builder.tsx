'use client';

import { useState } from 'react';
import { runReportQuery } from '@/lib/actions/reports';

const DATA_SOURCES = ['Students', 'Fees', 'Attendance'];

export default function ReportBuilder() {
    const [selectedSource, setSelectedSource] = useState<string>('Students');
    const [loading, setLoading] = useState<boolean>(false);
    const [reportData, setReportData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleGenerateReport = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const res = await runReportQuery(selectedSource);
            if (res.success) {
                setReportData(res.data || []);
                setColumns(res.columns || []);
            } else {
                setError(res.error || 'Failed to generate report');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (!reportData || reportData.length === 0) return;
        
        // Escape and quote values for CSV
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
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50/50">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label htmlFor="dataSource" className="block text-sm font-medium text-gray-700 mb-1">
                            Data Source
                        </label>
                        <select
                            id="dataSource"
                            value={selectedSource}
                            onChange={(e) => setSelectedSource(e.target.value)}
                            className="block w-full sm:w-64 rounded-lg border-gray-300 border px-3 py-2 text-gray-900 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                            {DATA_SOURCES.map((source) => (
                                <option key={source} value={source}>
                                    {source} Data
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button
                            onClick={handleGenerateReport}
                            disabled={loading}
                            className="flex-1 sm:flex-none inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating...
                                </>
                            ) : (
                                'Generate Report'
                            )}
                        </button>
                        
                        {reportData.length > 0 && (
                            <button
                                onClick={handleExportCSV}
                                className="flex-1 sm:flex-none inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                            >
                                <svg className="mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-0">
                {error && (
                    <div className="p-4 m-6 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {!error && reportData.length === 0 && !loading && (
                    <div className="text-center py-12 px-4">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No data generated yet</h3>
                        <p className="mt-1 text-sm text-gray-500">Select a data source and click Generate Report.</p>
                    </div>
                )}

                {!error && reportData.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {columns.map((col, idx) => (
                                        <th
                                            key={idx}
                                            scope="col"
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                                        >
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {reportData.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                                        {columns.map((col, colIdx) => (
                                            <td key={colIdx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {row[col] !== null && row[col] !== undefined 
                                                    ? String(row[col]) 
                                                    : <span className="text-gray-400 italic">N/A</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            
            {reportData.length > 0 && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex justify-between">
                    <span>Showing {reportData.length} records</span>
                    <span>Report generated for {selectedSource} Data</span>
                </div>
            )}
        </div>
    );
}
