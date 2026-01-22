'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ApiEndpoint {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    description: string;
    tags: string[];
    parameters?: { name: string; type: string; required: boolean; description: string }[];
    responseExample?: string;
}

const apiEndpoints: ApiEndpoint[] = [
    // Students
    { method: 'GET', path: '/api/v1/students', description: 'List all students with pagination', tags: ['Students'], parameters: [{ name: 'page', type: 'number', required: false, description: 'Page number' }, { name: 'limit', type: 'number', required: false, description: 'Items per page' }] },
    { method: 'GET', path: '/api/v1/students/{id}', description: 'Get student by ID', tags: ['Students'], parameters: [{ name: 'id', type: 'string', required: true, description: 'Student ID' }] },
    { method: 'POST', path: '/api/v1/students', description: 'Create a new student', tags: ['Students'] },
    { method: 'PUT', path: '/api/v1/students/{id}', description: 'Update student details', tags: ['Students'] },

    // Fees
    { method: 'GET', path: '/api/v1/fees/plans', description: 'List all fee plans', tags: ['Fees'] },
    { method: 'GET', path: '/api/v1/fees/invoices', description: 'List invoices with filters', tags: ['Fees'] },
    { method: 'POST', path: '/api/v1/fees/invoices', description: 'Create new invoice', tags: ['Fees'] },
    { method: 'POST', path: '/api/v1/fees/payments', description: 'Record fee payment', tags: ['Fees'] },
    { method: 'GET', path: '/api/v1/fees/defaulters', description: 'Get fee defaulters list', tags: ['Fees'] },

    // Attendance
    { method: 'GET', path: '/api/v1/attendance/sections/{sectionId}', description: 'Get section attendance', tags: ['Attendance'] },
    { method: 'POST', path: '/api/v1/attendance/mark', description: 'Mark attendance for students', tags: ['Attendance'] },
    { method: 'GET', path: '/api/v1/attendance/students/{studentId}', description: 'Get student attendance history', tags: ['Attendance'] },

    // Exams
    { method: 'GET', path: '/api/v1/exams', description: 'List all exams', tags: ['Exams'] },
    { method: 'POST', path: '/api/v1/exams/marks', description: 'Enter exam marks', tags: ['Exams'] },
    { method: 'GET', path: '/api/v1/exams/report-cards/{studentId}', description: 'Generate report card', tags: ['Exams'] },

    // Health
    { method: 'GET', path: '/api/v1/health-records', description: 'List health records', tags: ['Health'] },
    { method: 'POST', path: '/api/v1/health-records', description: 'Create health record', tags: ['Health'] },

    // Library
    { method: 'GET', path: '/api/v1/library/books', description: 'List all books', tags: ['Library'] },
    { method: 'POST', path: '/api/v1/library/issues', description: 'Issue book to student', tags: ['Library'] },
    { method: 'POST', path: '/api/v1/library/returns', description: 'Return book', tags: ['Library'] },

    // Messages
    { method: 'POST', path: '/api/v1/messages/send', description: 'Send SMS/WhatsApp message', tags: ['Messages'] },
    { method: 'GET', path: '/api/v1/messages/status/{messageId}', description: 'Get message delivery status', tags: ['Messages'] },
];

const tags = ['All', 'Students', 'Fees', 'Attendance', 'Exams', 'Health', 'Library', 'Messages'];

export default function ApiDocsPage() {
    const [selectedTag, setSelectedTag] = useState('All');
    const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

    const filteredEndpoints = selectedTag === 'All'
        ? apiEndpoints
        : apiEndpoints.filter(e => e.tags.includes(selectedTag));

    const getMethodBadge = (method: ApiEndpoint['method']) => {
        const colors: Record<string, string> = {
            GET: 'bg-green-500 text-white',
            POST: 'bg-blue-500 text-white',
            PUT: 'bg-orange-500 text-white',
            PATCH: 'bg-yellow-500 text-white',
            DELETE: 'bg-red-500 text-white',
        };
        return <Badge className={`${colors[method]} font-mono w-16 justify-center`}>{method}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">API Documentation</h1>
                    <p className="text-gray-600 mt-1">REST API endpoints for School SIS</p>
                </div>
                <div className="flex gap-3">
                    <Badge className="bg-green-100 text-green-700">v1.0</Badge>
                    <Badge variant="outline">Base URL: /api/v1</Badge>
                </div>
            </div>

            {/* Auth Info */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                        <div className="text-2xl">🔐</div>
                        <div>
                            <h3 className="font-semibold text-blue-900">Authentication</h3>
                            <p className="text-sm text-blue-700 mt-1">
                                All API requests require a Bearer token in the Authorization header.
                            </p>
                            <code className="block mt-2 p-2 bg-blue-100 rounded text-xs font-mono">
                                Authorization: Bearer &lt;your-api-token&gt;
                            </code>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tags Filter */}
            <div className="flex gap-2 flex-wrap">
                {tags.map(tag => (
                    <button
                        key={tag}
                        onClick={() => setSelectedTag(tag)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedTag === tag
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                    >
                        {tag}
                    </button>
                ))}
            </div>

            {/* Endpoints List */}
            <div className="space-y-2">
                {filteredEndpoints.map((endpoint, idx) => {
                    const key = `${endpoint.method}-${endpoint.path}`;
                    const isExpanded = expandedEndpoint === key;

                    return (
                        <Card
                            key={idx}
                            className={`cursor-pointer transition-all ${isExpanded ? 'border-blue-300' : ''}`}
                            onClick={() => setExpandedEndpoint(isExpanded ? null : key)}
                        >
                            <CardContent className="py-3">
                                <div className="flex items-center gap-4">
                                    {getMethodBadge(endpoint.method)}
                                    <code className="font-mono text-sm flex-1">{endpoint.path}</code>
                                    <span className="text-sm text-gray-600">{endpoint.description}</span>
                                    <svg
                                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>

                                {isExpanded && endpoint.parameters && (
                                    <div className="mt-4 pt-4 border-t">
                                        <h4 className="text-sm font-medium mb-2">Parameters</h4>
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Name</th>
                                                    <th className="px-3 py-2 text-left">Type</th>
                                                    <th className="px-3 py-2 text-left">Required</th>
                                                    <th className="px-3 py-2 text-left">Description</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {endpoint.parameters.map((param, pIdx) => (
                                                    <tr key={pIdx} className="border-b">
                                                        <td className="px-3 py-2 font-mono text-blue-600">{param.name}</td>
                                                        <td className="px-3 py-2">{param.type}</td>
                                                        <td className="px-3 py-2">
                                                            <Badge variant={param.required ? 'default' : 'outline'} className="text-xs">
                                                                {param.required ? 'Required' : 'Optional'}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600">{param.description}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Rate Limiting */}
            <Card className="bg-orange-50 border-orange-200">
                <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                        <div className="text-2xl">⚡</div>
                        <div>
                            <h3 className="font-semibold text-orange-900">Rate Limiting</h3>
                            <p className="text-sm text-orange-700 mt-1">
                                API requests are limited to <strong>1000 requests/hour</strong> per API key.
                                Exceeded limits return HTTP 429.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
