'use client';

/**
 * @module app/(admin)/reports/custom-object-report-builder
 *
 * Metadata-Driven Report Builder over any Custom EAV Object, Standard Object,
 * or Education Cloud Blueprint Object (`academic_program`, `semester_enrollment`,
 * `placement_drive`, `coaching_batch`, `coaching_inquiry`, `test_series_attempt`).
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { BarChart3, Download, Layers, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';
import {
    runCustomObjectBiReport,
    type CustomObjectReportCatalogEntry,
} from './bi-actions';
import type { BiReportColumn, BiReportRow } from './bi-types';

export function CustomObjectReportBuilder({
    catalog,
}: {
    catalog: CustomObjectReportCatalogEntry[];
}) {
    const [selectedObjectApi, setSelectedObjectApi] = useState<string>(
        catalog.find(c => c.isCustom)?.apiName || catalog[0]?.apiName || '',
    );
    const activeObject = catalog.find(c => c.apiName === selectedObjectApi) || null;

    const [groupByField, setGroupByField] = useState<string>(
        activeObject?.dimensionFields[0]?.apiName || '',
    );
    const [aggregateFn, setAggregateFn] = useState<RollupAggregateFunction>('COUNT');
    const [metricField, setMetricField] = useState<string>(
        activeObject?.numericFields[0]?.apiName || '',
    );

    const [running, setRunning] = useState(false);
    const [columns, setColumns] = useState<BiReportColumn[]>([]);
    const [rows, setRows] = useState<BiReportRow[]>([]);
    const [scannedCount, setScannedCount] = useState<number | null>(null);

    const handleObjectChange = (nextApi: string) => {
        setSelectedObjectApi(nextApi);
        const entry = catalog.find(c => c.apiName === nextApi);
        setGroupByField(entry?.dimensionFields[0]?.apiName || '');
        setMetricField(entry?.numericFields[0]?.apiName || '');
        setColumns([]);
        setRows([]);
        setScannedCount(null);
    };

    const handleRunReport = async () => {
        if (!selectedObjectApi || !groupByField) {
            toast.error('Select a metadata object and a Group-By dimension field.');
            return;
        }
        setRunning(true);
        try {
            const res = await runCustomObjectBiReport({
                objectApiName: selectedObjectApi,
                groupByField,
                aggregateFunction: aggregateFn,
                metricField: aggregateFn === 'COUNT' ? undefined : metricField,
            });
            if (!res.success || !res.columns || !res.rows) {
                toast.error(res.error || 'Report execution failed.');
                return;
            }
            setColumns(res.columns);
            setRows(res.rows);
            setScannedCount(res.totalRecordsScanned ?? 0);
            toast.success(
                `Aggregated ${res.totalRecordsScanned ?? 0} record(s) into ${res.rows.length} group(s).`,
            );
        } finally {
            setRunning(false);
        }
    };

    const handleExportCsv = () => {
        if (columns.length === 0) return;
        const headers = columns.map(c => c.label).join(',');
        const body = rows
            .map(r => columns.map(c => String(r[c.label] ?? '')).join(','))
            .join('\n');
        const csv = `${headers}\n${body}`;
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedObjectApi}_custom_report.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    if (catalog.length === 0) return null;

    return (
        <Card className="border-primary/20 shadow-sm" data-testid="custom-object-report-builder">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            Metadata-Driven Custom Object Reports (Education Cloud)
                        </CardTitle>
                        <CardDescription>
                            Group and aggregate any custom object, formula (`f(x)`), or roll-up
                            summary (`Σ`) field across K-12, College, and Coaching schemas.
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit font-mono text-xs">
                        {catalog.length} Objects Queryable
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs">1. Metadata Object</Label>
                        <Select value={selectedObjectApi} onValueChange={handleObjectChange}>
                            <SelectTrigger data-testid="custom-report-object-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {catalog.map(entry => (
                                    <SelectItem key={entry.apiName} value={entry.apiName}>
                                        {entry.label} ({entry.apiName})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">2. Group By Dimension</Label>
                        <Select value={groupByField} onValueChange={setGroupByField}>
                            <SelectTrigger data-testid="custom-report-dimension-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(activeObject?.dimensionFields || []).map(dim => (
                                    <SelectItem key={dim.apiName} value={dim.apiName}>
                                        {dim.label} ({dim.dataType})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">3. Aggregate Function</Label>
                        <Select
                            value={aggregateFn}
                            onValueChange={v => setAggregateFn(v as RollupAggregateFunction)}
                        >
                            <SelectTrigger data-testid="custom-report-agg-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="COUNT">COUNT (Record Count)</SelectItem>
                                <SelectItem value="SUM">SUM (Total)</SelectItem>
                                <SelectItem value="AVG">AVG (Average)</SelectItem>
                                <SelectItem value="MIN">MIN (Minimum)</SelectItem>
                                <SelectItem value="MAX">MAX (Maximum)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {aggregateFn !== 'COUNT' ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs">4. Numeric / Formula Field</Label>
                            <Select value={metricField} onValueChange={setMetricField}>
                                <SelectTrigger data-testid="custom-report-metric-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(activeObject?.numericFields || []).map(nf => (
                                        <SelectItem key={nf.apiName} value={nf.apiName}>
                                            {nf.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleRunReport}
                                disabled={running || !selectedObjectApi || !groupByField}
                                data-testid="run-custom-object-report"
                                className="w-full"
                            >
                                {running ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Running...
                                    </>
                                ) : (
                                    <>
                                        <BarChart3 className="w-4 h-4 mr-1.5" />
                                        Run Object Report
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </div>

                {aggregateFn !== 'COUNT' && (
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            onClick={handleRunReport}
                            disabled={running || !selectedObjectApi || !groupByField}
                            data-testid="run-custom-object-report"
                        >
                            {running ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <BarChart3 className="w-4 h-4 mr-1.5" />
                                    Run Object Report
                                </>
                            )}
                        </Button>
                    </div>
                )}

                {columns.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                                Scanned {scannedCount ?? 0} record(s) · {rows.length} group(s)
                            </span>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleExportCsv}
                                className="h-7 text-xs"
                            >
                                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
                            </Button>
                        </div>
                        <div className="rounded-md border border-border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {columns.map(col => (
                                            <TableHead key={col.label}>{col.label}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.length === 0 ? (
                                        <TableRow>
                                            <TableCell
                                                colSpan={columns.length}
                                                className="text-center text-muted-foreground py-6"
                                            >
                                                No records found for this object yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rows.map((row, idx) => (
                                            <TableRow key={idx}>
                                                {columns.map(col => (
                                                    <TableCell key={col.label}>
                                                        {String(row[col.label] ?? '—')}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
