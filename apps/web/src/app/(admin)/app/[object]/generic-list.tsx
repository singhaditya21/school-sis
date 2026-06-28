'use client';

import { MetadataField } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function GenericListClient({ 
    objectName, 
    fields, 
    records,
    layout
}: { 
    objectName: string, 
    fields: MetadataField[], 
    records: any[],
    layout?: any
}) {
    // If no layout is defined, just show all required fields plus the first few optional ones
    let displayColumns = layout?.columns || fields.slice(0, 5).map(f => f.apiName);

    return (
        <Card>
            <CardContent className="p-0">
                <div className="flex justify-end p-4 border-b">
                    <Link href={`/app/${objectName}/new`}>
                        <Button>
                            <Plus className="w-4 h-4 mr-2" /> New Record
                        </Button>
                    </Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b">
                            <tr>
                                {displayColumns.map((col: string) => {
                                    const field = fields.find(f => f.apiName === col);
                                    return (
                                        <th key={col} className="px-6 py-3 font-medium">
                                            {field ? field.label : col}
                                        </th>
                                    );
                                })}
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.length === 0 ? (
                                <tr>
                                    <td colSpan={displayColumns.length + 1} className="px-6 py-8 text-center text-slate-500">
                                        No records found.
                                    </td>
                                </tr>
                            ) : records.map(record => (
                                <tr key={record.id} className="bg-white border-b hover:bg-slate-50">
                                    {displayColumns.map((col: string) => (
                                        <td key={col} className="px-6 py-4">
                                            {String(record[col] ?? '-')}
                                        </td>
                                    ))}
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/app/${objectName}/${record.id}`} className="font-medium text-blue-600 hover:underline">
                                            Edit
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
