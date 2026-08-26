'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Database, Download, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { exportBiReport, runBiReport } from './bi-actions';
import type { BiReportColumn, BiReportRow, ReportWorkspace } from './bi-types';

const LIMIT_OPTIONS = [100, 500, 1000, 5000];

export default function ReportBuilder({ workspace }: { workspace: ReportWorkspace }) {
    const runnable = useMemo(() => workspace.datasets.filter((dataset) => dataset.executable), [workspace.datasets]);
    const blocked = useMemo(() => workspace.datasets.filter((dataset) => !dataset.executable), [workspace.datasets]);

    const [datasetId, setDatasetId] = useState<string>(runnable[0]?.id ?? '');
    const dataset = runnable.find((entry) => entry.id === datasetId) ?? null;

    const [metricIds, setMetricIds] = useState<string[]>([]);
    const [dimensionIds, setDimensionIds] = useState<string[]>([]);
    const [filterValues, setFilterValues] = useState<Record<string, string>>({});
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [limit, setLimit] = useState(500);

    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [columns, setColumns] = useState<BiReportColumn[]>([]);
    const [rows, setRows] = useState<BiReportRow[]>([]);
    const [hasRun, setHasRun] = useState(false);
    const [truncated, setTruncated] = useState(false);

    const [exportReason, setExportReason] = useState('');
    const [exporting, setExporting] = useState(false);
    const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
    const [approvalNotice, setApprovalNotice] = useState<string | null>(null);

    function selectDataset(nextId: string) {
        setDatasetId(nextId);
        setMetricIds([]);
        setDimensionIds([]);
        setFilterValues({});
        setDateFrom('');
        setDateTo('');
        setColumns([]);
        setRows([]);
        setHasRun(false);
        setError(null);
        setPendingApprovalId(null);
        setApprovalNotice(null);
    }

    function toggle(list: string[], value: string, setter: (next: string[]) => void) {
        setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
    }

    function buildRequest() {
        const filters = Object.entries(filterValues)
            .filter(([, raw]) => raw.trim() !== '')
            .map(([dimensionId, raw]) => {
                const values = raw.split(',').map((part) => part.trim()).filter(Boolean);
                return values.length > 1
                    ? { dimensionId, operator: 'in' as const, value: values }
                    : { dimensionId, operator: 'eq' as const, value: values[0] };
            });

        return {
            datasetId,
            metricIds,
            dimensionIds,
            filters,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            limit,
        };
    }

    async function handleRun() {
        if (!dataset || metricIds.length === 0) return;
        if (Boolean(dateFrom) !== Boolean(dateTo)) {
            setHasRun(false);
            setError('A date range needs both a start and an end date. Clear both to cover all history.');
            return;
        }
        setRunning(true);
        setError(null);
        setApprovalNotice(null);

        const result = await runBiReport(buildRequest());
        setRunning(false);
        setHasRun(true);

        if (!result.success) {
            setColumns([]);
            setRows([]);
            setTruncated(false);
            setError(result.error ?? 'Report execution failed.');
            return;
        }

        setColumns(result.columns ?? []);
        setRows(result.rows ?? []);
        setTruncated(Boolean(result.truncated));
    }

    async function handleExport(approvalRequestId?: string) {
        if (!dataset?.exportPolicy) return;
        if (dataset.exportPolicy.requiresReason && exportReason.trim() === '') {
            toast.error('This export policy requires an audit reason.');
            return;
        }

        setExporting(true);
        setApprovalNotice(null);

        const result = await exportBiReport({
            ...buildRequest(),
            exportPolicyId: dataset.exportPolicy.id,
            reason: exportReason,
            approvalRequestId,
        });
        setExporting(false);

        if (result.approvalRequired) {
            setPendingApprovalId(result.approvalRequestId ?? null);
            setApprovalNotice(result.error ?? 'This export needs workflow approval.');
            toast.message('Approval required', { description: result.error });
            return;
        }

        if (!result.success || !result.csv) {
            toast.error(result.error ?? 'Export failed.');
            return;
        }

        downloadCsv(result.csv, result.filename ?? 'bi-export.csv');
        setPendingApprovalId(null);
        toast.success(`Exported ${result.rowCount ?? 0} rows.`);
    }

    if (runnable.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>No runnable datasets</CardTitle>
                    <CardDescription>
                        Your role has catalog access, but none of the granted datasets has an execution plan on this
                        surface.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-600">
                    {blocked.map((entry) => (
                        <p key={entry.id}>
                            <span className="font-medium">{entry.label}:</span> {entry.unavailableReason}
                        </p>
                    ))}
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" /> Dataset
                    </CardTitle>
                    <CardDescription>{dataset?.description ?? 'Choose a governed dataset.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="bi-dataset">Dataset</Label>
                            <Select value={datasetId} onValueChange={selectDataset}>
                                <SelectTrigger id="bi-dataset" className="w-[320px]">
                                    <SelectValue placeholder="Select dataset" />
                                </SelectTrigger>
                                <SelectContent>
                                    {runnable.map((entry) => (
                                        <SelectItem key={entry.id} value={entry.id}>
                                            {entry.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="bi-limit">Row limit</Label>
                            <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
                                <SelectTrigger id="bi-limit" className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LIMIT_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={String(option)}>
                                            {option.toLocaleString()}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {dataset?.dateFilterLabel && (
                            <>
                                <div className="space-y-1">
                                    <Label htmlFor="bi-date-from">From ({dataset.dateFilterLabel})</Label>
                                    <Input
                                        id="bi-date-from"
                                        type="date"
                                        className="w-[170px]"
                                        value={dateFrom}
                                        onChange={(event) => setDateFrom(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="bi-date-to">To ({dataset.dateFilterLabel})</Label>
                                    <Input
                                        id="bi-date-to"
                                        type="date"
                                        className="w-[170px]"
                                        value={dateTo}
                                        onChange={(event) => setDateTo(event.target.value)}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {dataset?.dateFilterLabel && (
                        <p className="-mt-2 text-xs text-gray-500">
                            The date range filters on <span className="font-medium">{dataset.dateFilterLabel}</span> and
                            accepts spans of up to 1,096 days. Leave both boxes empty to cover all history.
                        </p>
                    )}

                    {dataset && (
                        <div className="grid gap-6 md:grid-cols-2">
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Metrics</h3>
                                <div className="space-y-2">
                                    {dataset.metrics.map((metric) => (
                                        <label key={metric.id} className="flex items-start gap-3 text-sm">
                                            <Checkbox
                                                className="mt-0.5"
                                                checked={metricIds.includes(metric.id)}
                                                onCheckedChange={() => toggle(metricIds, metric.id, setMetricIds)}
                                            />
                                            <span>
                                                <span className="font-medium">{metric.label}</span>
                                                <span className="block text-xs text-gray-500">{metric.description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Group by</h3>
                                <div className="space-y-2">
                                    {dataset.dimensions.map((dimension) => (
                                        <label key={dimension.id} className="flex items-center gap-3 text-sm">
                                            <Checkbox
                                                checked={dimensionIds.includes(dimension.id)}
                                                onCheckedChange={() => toggle(dimensionIds, dimension.id, setDimensionIds)}
                                            />
                                            <span className="font-medium">{dimension.label}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    With nothing selected the report returns a single total row.
                                </p>
                            </div>
                        </div>
                    )}

                    {dataset && dataset.dimensions.some((dimension) => dimension.filterable) && (
                        <div>
                            <h3 className="text-sm font-semibold mb-2">Filters</h3>
                            <div className="grid gap-3 md:grid-cols-3">
                                {dataset.dimensions
                                    .filter((dimension) => dimension.filterable)
                                    .map((dimension) => (
                                        <div key={dimension.id} className="space-y-1">
                                            <Label htmlFor={`filter-${dimension.id}`} className="text-xs">
                                                {dimension.label}
                                            </Label>
                                            <Input
                                                id={`filter-${dimension.id}`}
                                                placeholder="any"
                                                value={filterValues[dimension.id] ?? ''}
                                                onChange={(event) =>
                                                    setFilterValues({ ...filterValues, [dimension.id]: event.target.value })
                                                }
                                            />
                                        </div>
                                    ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Values are matched exactly. Separate several values with commas to match any of them.
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <Button onClick={handleRun} disabled={running || metricIds.length === 0}>
                            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Run report
                        </Button>
                        {metricIds.length === 0 && (
                            <span className="text-sm text-gray-500">Select at least one metric.</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {error && (
                <div className="p-4 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
            )}

            {hasRun && !error && (
                <Card>
                    <CardHeader>
                        <CardTitle>Results</CardTitle>
                        <CardDescription>
                            {rows.length === 0
                                ? 'The query ran successfully and matched no rows.'
                                : `${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}${truncated ? ` (row limit of ${limit.toLocaleString()} reached — narrow the filters for a complete answer)` : ''}`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {rows.length > 0 && (
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map((column) => (
                                                <TableHead
                                                    key={column.label}
                                                    className={`whitespace-nowrap ${column.kind === 'metric' ? 'text-right' : ''}`}
                                                >
                                                    {column.label}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.map((row, rowIndex) => (
                                            <TableRow key={rowIndex}>
                                                {columns.map((column) => (
                                                    <TableCell
                                                        key={column.label}
                                                        className={column.kind === 'metric' ? 'text-right tabular-nums' : ''}
                                                    >
                                                        {formatCell(row[column.label] ?? null, column)}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        {dataset?.exportPolicy ? (
                            <div className="rounded-md border p-4 space-y-3">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <ShieldCheck className="h-4 w-4" /> Governed export — {dataset.exportPolicy.label}
                                </div>
                                <p className="text-xs text-gray-600">
                                    CSV, up to {dataset.exportPolicy.maxRows.toLocaleString()} rows.{' '}
                                    {dataset.exportPolicy.requiresApproval
                                        ? 'This policy is approval-gated: the first request raises a workflow approval, and the file is released once it is approved.'
                                        : 'This policy releases the file immediately, with the audit reason recorded.'}
                                </p>
                                {dataset.exportPolicy.requiresReason && (
                                    <div className="space-y-1">
                                        <Label htmlFor="export-reason" className="text-xs">
                                            Audit reason (required)
                                        </Label>
                                        <Textarea
                                            id="export-reason"
                                            rows={2}
                                            value={exportReason}
                                            onChange={(event) => setExportReason(event.target.value)}
                                            placeholder="Why is this data leaving the system?"
                                        />
                                    </div>
                                )}
                                {approvalNotice && (
                                    <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <span>
                                            {approvalNotice}{' '}
                                            <Link href="/approvals" className="underline">
                                                Open the approvals queue
                                            </Link>
                                            .
                                        </span>
                                    </div>
                                )}
                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={() => handleExport()} disabled={exporting || metricIds.length === 0}>
                                        {exporting ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Download className="mr-2 h-4 w-4" />
                                        )}
                                        {dataset.exportPolicy.requiresApproval ? 'Request export' : 'Export CSV'}
                                    </Button>
                                    {pendingApprovalId && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleExport(pendingApprovalId)}
                                            disabled={exporting}
                                        >
                                            Retry once approved
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-500">
                                The catalog defines no export policy for this dataset, so it cannot be downloaded from
                                here.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {(blocked.length > 0 || workspace.governanceSignals.length > 0 || workspace.dashboards.length > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Catalog notes</CardTitle>
                        <CardDescription>
                            Snapshot generated {new Date(workspace.generatedAt).toLocaleString()}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        {workspace.governanceSignals.length > 0 && (
                            <ul className="list-disc pl-5 space-y-1 text-gray-600">
                                {workspace.governanceSignals.map((signal) => (
                                    <li key={signal}>{signal}</li>
                                ))}
                            </ul>
                        )}
                        {workspace.dashboards.length > 0 && (
                            <div>
                                <h3 className="font-semibold mb-2">Dashboards for your role</h3>
                                <div className="flex flex-wrap gap-2">
                                    {workspace.dashboards.map((dashboard) => (
                                        <Link
                                            key={dashboard.id}
                                            href={dashboard.route}
                                            className="px-3 py-1.5 rounded-md border text-xs hover:bg-gray-50"
                                        >
                                            {dashboard.title}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        {blocked.length > 0 && (
                            <div>
                                <h3 className="font-semibold mb-2">Not runnable here</h3>
                                <div className="space-y-2 text-gray-600">
                                    {blocked.map((entry) => (
                                        <p key={entry.id}>
                                            <Badge variant="outline" className="mr-2">
                                                {entry.label}
                                            </Badge>
                                            {entry.unavailableReason}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function formatCell(value: string | number | null, column: BiReportColumn): string {
    if (value === null) return '—';
    if (column.kind !== 'metric' || typeof value !== 'number') return String(value);

    switch (column.format) {
        case 'currency':
            return formatCurrency(value);
        case 'percentage':
            return `${value}%`;
        default:
            return value.toLocaleString();
    }
}

function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
