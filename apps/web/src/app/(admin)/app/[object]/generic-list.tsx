'use client';

import { MetadataField } from '@/lib/actions/metadata-engine';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Renders a value using the field's declared data type, so a metadata-defined
 * module formats money, dates and booleans the same way a hand-built one does.
 */
function renderCell(field: MetadataField | undefined, value: unknown): string {
    if (value == null || value === '') return '-';
    switch (field?.dataType) {
        case 'CURRENCY':
            // numeric(12,2) RUPEES, exactly as the hand-built modules store money.
            return formatCurrency(value as string | number);
        case 'DATE':
            return formatDate(String(value));
        case 'BOOLEAN':
            return value === true || value === 'true' ? 'Yes' : 'No';
        default:
            return String(value);
    }
}

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
    // Prefer the configured LIST layout, but never show a column the caller is
    // not allowed to read: `fields` has already been filtered by role.
    const readableNames = new Set(fields.map(f => f.apiName));
    const layoutColumns: string[] = Array.isArray(layout?.columns) ? layout.columns : [];
    const configured = layoutColumns.filter(col => readableNames.has(col));
    const displayColumns = configured.length > 0
        ? configured
        : fields.slice(0, 5).map(f => f.apiName);

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
                                            {renderCell(fields.find(f => f.apiName === col), record[col])}
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
