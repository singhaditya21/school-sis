'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    aiAssistLegacyColumnMappingAction,
    commitLegacyImportAction,
    previewLegacyImportAction,
    rollbackLegacyImportBatchAction,
    type AiLegacyMappingResult,
    type LegacyImportBatchItem,
    type LegacyImportCommitResult,
    type LegacyImportPreviewResult,
} from '@/lib/actions/legacy-import';
import {
    autoMapLegacyColumns,
    parseDelimitedSpreadsheet,
    SAMPLE_LEGACY_ERP_CSV,
    type ColumnMapping,
    type LegacyErpPreset,
    type TargetFieldKey,
} from '@/lib/import/legacy-erp-parser';
import { formatCurrency } from '@/lib/format/currency';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SOURCE_ERP_OPTIONS: Array<{ value: LegacyErpPreset; label: string }> = [
    { value: 'AUTO', label: 'Auto-Detect Columns (Recommended)' },
    { value: 'ENTAB', label: 'Entab CampusCare Export' },
    { value: 'FEDENA', label: 'Fedena Student & Fee CSV' },
    { value: 'MCB', label: 'MyClassboard (MCB) Export' },
    { value: 'EDUNEXT', label: 'Edunext ERP Export' },
    { value: 'TALLY', label: 'Tally Student Arrears CSV' },
    { value: 'SCHOLARMIND_CSV', label: 'Standard Excel / CSV' },
];

const MAPPABLE_FIELDS: Array<{ key: TargetFieldKey; label: string; required?: boolean }> = [
    { key: 'admissionNumber', label: 'Admission / Enrollment No.', required: true },
    { key: 'fullName', label: 'Student Full Name (or use First/Last below)' },
    { key: 'firstName', label: 'Student First Name' },
    { key: 'lastName', label: 'Student Last Name' },
    { key: 'gradeName', label: 'Class / Grade (e.g. Grade 8 or 8-A)', required: true },
    { key: 'sectionName', label: 'Section (optional if included in Class)' },
    { key: 'dateOfBirth', label: 'Date of Birth (DD/MM/YYYY or YYYY-MM-DD)' },
    { key: 'gender', label: 'Gender' },
    { key: 'rollNumber', label: 'Roll Number' },
    { key: 'bloodGroup', label: 'Blood Group' },
    { key: 'guardianName', label: 'Father / Mother / Guardian Name' },
    { key: 'guardianPhone', label: 'Parent Mobile / WhatsApp (Encrypted)' },
    { key: 'guardianEmail', label: 'Parent Email (Encrypted)' },
    { key: 'openingFeeBalance', label: 'Opening Fee Balance / Arrears (₹)' },
    { key: 'feeDescription', label: 'Opening Fee Narration / Remarks' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' },
];

function formatInr(val: number): string {
    return formatCurrency(val);
}

export function LegacyImportWizardClient({
    initialBatches,
}: {
    initialBatches: LegacyImportBatchItem[];
}) {
    const [sourceErp, setSourceErp] = useState<LegacyErpPreset>('AUTO');
    const [csvText, setCsvText] = useState('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [defaultDueDate, setDefaultDueDate] = useState('2026-12-31');
    const [preview, setPreview] = useState<LegacyImportPreviewResult | null>(null);
    const [aiInsights, setAiInsights] = useState<AiLegacyMappingResult | null>(null);
    const [commitResult, setCommitResult] = useState<LegacyImportCommitResult | null>(null);
    const [batches, setBatches] = useState<LegacyImportBatchItem[]>(initialBatches);
    const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function applyRawSpreadsheet(nextText: string) {
        setCsvText(nextText);
        setPreview(null);
        setAiInsights(null);
        setCommitResult(null);
        const parsed = parseDelimitedSpreadsheet(nextText);
        setHeaders(parsed.headers);
        setMapping(autoMapLegacyColumns(parsed.headers));
    }

    function handleAiAutoMap() {
        startTransition(async () => {
            const res = await aiAssistLegacyColumnMappingAction({
                csvText,
                sourceErp,
            });
            if (!res.ok) {
                toast.error(res.error || 'AI column mapping failed.');
                return;
            }
            if (res.mapping) {
                setMapping(res.mapping);
            }
            setAiInsights(res);
            setPreview(null);
            toast.success('Columns auto-mapped and spreadsheet anomalies audited.');
        });
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const content = typeof reader.result === 'string' ? reader.result : '';
            applyRawSpreadsheet(content);
            toast.success(`Loaded ${file.name} — columns auto-mapped!`);
        };
        reader.readAsText(file);
    }

    function handleDownloadTemplate() {
        const blob = new Blob([SAMPLE_LEGACY_ERP_CSV], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'scholarmind-legacy-erp-template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function handleRunDryRun() {
        startTransition(async () => {
            const res = await previewLegacyImportAction({
                csvText,
                mapping,
                sourceErp,
            });
            if (!res.ok) {
                toast.error(res.error || 'Dry-run validation failed.');
                return;
            }
            setPreview(res);
            setCommitResult(null);
            toast.success(`Dry-run complete: ${res.readyCount ?? 0} rows ready to import.`);
        });
    }

    function handleCommitImport() {
        startTransition(async () => {
            const res = await commitLegacyImportAction({
                csvText,
                mapping,
                sourceErp,
                defaultDueDate,
            });
            if (!res.ok) {
                toast.error(res.error || 'Migration commit failed.');
                return;
            }
            setCommitResult(res);
            if (res.batchId) {
                setBatches((prev) => [
                    {
                        batchId: res.batchId!,
                        sourceErp,
                        createdAt: 'Just now',
                        studentsCreated: res.studentsCreated ?? 0,
                        guardiansCreated: res.guardiansCreated ?? 0,
                        openingInvoicesCreated: res.openingInvoicesCreated ?? 0,
                        totalOpeningBalanceInr: res.totalOpeningBalanceInr ?? 0,
                        rolledBack: false,
                    },
                    ...prev,
                ]);
            }
            toast.success(`Migrated ${res.studentsCreated ?? 0} students into live workspace!`);
        });
    }

    function handleRollback(batchId: string) {
        startTransition(async () => {
            const res = await rollbackLegacyImportBatchAction(batchId);
            setConfirmRollbackId(null);
            if (!res.ok) {
                toast.error(res.error || 'Rollback blocked.');
                return;
            }
            setBatches((prev) =>
                prev.map((b) => (b.batchId === batchId ? { ...b, rolledBack: true } : b)),
            );
            toast.success(
                `Rolled back batch (${res.removedStudents ?? 0} students & ${res.removedInvoices ?? 0} opening invoices removed).`,
            );
        });
    }

    return (
        <div className="space-y-8">
            {/* Step 1: Upload or Load Sample */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-xl">
                                Step 1 — Upload Legacy ERP CSV or Paste Excel Rows
                            </CardTitle>
                            <CardDescription>
                                Supports Entab, Fedena, MyClassboard, Edunext, Tally Student Arrears, and Excel exports (up to 2,000 students per batch).
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                data-testid="load-sample-erp-csv"
                                onClick={() => {
                                    setSourceErp('ENTAB');
                                    applyRawSpreadsheet(SAMPLE_LEGACY_ERP_CSV);
                                    toast.success('Sample Entab CBSE export loaded!');
                                }}
                            >
                                ✨ Load Sample Entab CSV
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleDownloadTemplate}
                            >
                                Download CSV Template
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="source-erp-select">Source ERP Format</Label>
                            <select
                                id="source-erp-select"
                                value={sourceErp}
                                onChange={(e) => setSourceErp(e.target.value as LegacyErpPreset)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {SOURCE_ERP_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="erp-csv-file">Upload CSV / TSV File</Label>
                            <Input
                                id="erp-csv-file"
                                type="file"
                                accept=".csv,.tsv,.txt"
                                onChange={handleFileUpload}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="opening-due-date">Opening Balance Due Date</Label>
                            <Input
                                id="opening-due-date"
                                type="date"
                                value={defaultDueDate}
                                onChange={(e) => setDefaultDueDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="raw-csv-textarea">
                            Spreadsheet Content (CSV or Tab-Separated Paste from Excel / Google Sheets)
                        </Label>
                        <textarea
                            id="raw-csv-textarea"
                            data-testid="erp-csv-textarea"
                            rows={6}
                            value={csvText}
                            onChange={(e) => applyRawSpreadsheet(e.target.value)}
                            placeholder="Paste rows directly from Excel or click 'Load Sample Entab CSV' above..."
                            className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs text-foreground"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Step 2: Column Mapper */}
            {headers.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <CardTitle className="text-xl">
                                    Step 2 — Smart Column Mapping ({headers.length} columns detected)
                                </CardTitle>
                                <CardDescription>
                                    Verify or adjust how your legacy spreadsheet columns map into ScholarMind&apos;s encrypted student &amp; fee schema.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    data-testid="ai-assist-column-map"
                                    disabled={isPending}
                                    onClick={handleAiAutoMap}
                                >
                                    ✨ AI Auto-Map &amp; Anomaly Audit
                                </Button>
                                <Button
                                    type="button"
                                    data-testid="run-import-dry-run"
                                    disabled={isPending}
                                    onClick={handleRunDryRun}
                                >
                                    {isPending ? 'Validating rows…' : 'Run Dry-Run Validation →'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {aiInsights?.ok && (
                            <div
                                data-testid="ai-mapping-insights"
                                className="rounded-xl border border-primary/30 bg-muted/50 p-4 space-y-2.5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-foreground">
                                        {aiInsights.summary}
                                    </p>
                                    <Badge variant="outline" className="text-[11px]">
                                        PII-Masked · {aiInsights.engine}
                                    </Badge>
                                </div>
                                {aiInsights.warnings && aiInsights.warnings.length > 0 && (
                                    <ul className="space-y-1 text-xs text-muted-foreground list-disc pl-4">
                                        {aiInsights.warnings.map((w, idx) => (
                                            <li key={idx}>{w}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {MAPPABLE_FIELDS.map((field) => (
                                <div key={field.key} className="space-y-1">
                                    <Label className="text-xs">
                                        {field.label}
                                        {field.required && <span className="text-destructive ml-1">*</span>}
                                    </Label>
                                    <select
                                        value={mapping[field.key] || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setMapping((prev) => ({
                                                ...prev,
                                                [field.key]: val || undefined,
                                            }));
                                            setPreview(null);
                                        }}
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                                    >
                                        <option value="">— Not Mapped —</option>
                                        {headers.map((h) => (
                                            <option key={h} value={h}>
                                                {h}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Dry-Run Preview */}
            {preview?.ok && (
                <Card data-testid="import-dry-run-summary" className="border-primary/40 shadow-md">
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-xl">
                                    Step 3 — Dry-Run Validation Report (Zero DB Changes Yet)
                                </CardTitle>
                                <CardDescription>
                                    Review row health, sibling guardian links, and opening fee balances before committing.
                                </CardDescription>
                            </div>

                            {(preview.readyCount ?? 0) > 0 && !commitResult?.ok && (
                                <Button
                                    type="button"
                                    data-testid="commit-legacy-import"
                                    disabled={isPending}
                                    onClick={handleCommitImport}
                                >
                                    {isPending
                                        ? 'Committing atomic migration…'
                                        : `Commit ${preview.readyCount} Students to Live Workspace →`}
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded-xl border border-success/30 bg-success-subtle p-3.5">
                                <p className="text-xs text-muted-foreground">Ready to Import</p>
                                <p className="text-2xl font-bold tabular-nums text-success-subtle-foreground">
                                    {preview.readyCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/60 p-3.5">
                                <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">
                                    {preview.duplicateCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-destructive/30 bg-destructive-subtle p-3.5">
                                <p className="text-xs text-muted-foreground">Validation Errors</p>
                                <p className="text-2xl font-bold tabular-nums text-destructive-subtle-foreground">
                                    {preview.errorCount ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/60 p-3.5">
                                <p className="text-xs text-muted-foreground">Opening Fee Arrears</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">
                                    {formatInr(preview.totalOpeningBalanceInr ?? 0)}
                                </p>
                            </div>
                            <div className="rounded-xl border border-border bg-muted/60 p-3.5">
                                <p className="text-xs text-muted-foreground">Sibling Phone Groups</p>
                                <p className="text-2xl font-bold tabular-nums text-foreground">
                                    {preview.siblingPhoneMatches ?? 0}
                                </p>
                            </div>
                        </div>

                        {preview.newGradesToCreate && preview.newGradesToCreate.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Auto-provisioning missing classes on commit:{' '}
                                <span className="font-semibold text-foreground">
                                    {preview.newGradesToCreate.join(', ')}
                                </span>
                            </p>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-muted border-b border-border">
                                    <tr>
                                        <th className="p-3 font-semibold">Row</th>
                                        <th className="p-3 font-semibold">Admission No.</th>
                                        <th className="p-3 font-semibold">Student</th>
                                        <th className="p-3 font-semibold">Class · Section</th>
                                        <th className="p-3 font-semibold">Guardian (Encrypted)</th>
                                        <th className="p-3 font-semibold text-right">Opening Balance</th>
                                        <th className="p-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {(preview.sampleRows ?? []).map((row) => (
                                        <tr key={`${row.rowNumber}-${row.admissionNumber}`}>
                                            <td className="p-3 font-mono text-muted-foreground">{row.rowNumber}</td>
                                            <td className="p-3 font-mono font-medium">{row.admissionNumber}</td>
                                            <td className="p-3 font-medium">{row.studentName}</td>
                                            <td className="p-3">{row.gradeSection}</td>
                                            <td className="p-3 text-muted-foreground">{row.guardianSummary}</td>
                                            <td className="p-3 text-right tabular-nums">
                                                {row.openingBalanceInr > 0 ? formatInr(row.openingBalanceInr) : '—'}
                                            </td>
                                            <td className="p-3">
                                                <Badge
                                                    variant={
                                                        row.status === 'READY'
                                                            ? 'default'
                                                            : row.status === 'SKIP_DUPLICATE'
                                                                ? 'secondary'
                                                                : 'destructive'
                                                    }
                                                >
                                                    {row.status}
                                                </Badge>
                                                <span className="ml-2 text-muted-foreground">{row.notes}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Commit Confirmation */}
            {commitResult?.ok && (
                <Card
                    data-testid="import-commit-success"
                    className="border-success/40 bg-success-subtle/30"
                >
                    <CardHeader>
                        <CardTitle className="text-xl text-success-subtle-foreground">
                            ✓ Migration Batch Committed Successfully!
                        </CardTitle>
                        <CardDescription>
                            Created {commitResult.studentsCreated} students, {commitResult.guardiansCreated} encrypted guardian records, and {commitResult.openingInvoicesCreated} opening fee invoices ({formatInr(commitResult.totalOpeningBalanceInr ?? 0)}).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-3">
                        <Link
                            href="/students"
                            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                        >
                            View Imported Students →
                        </Link>
                        <Link
                            href="/invoices"
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground"
                        >
                            View Opening Fee Invoices →
                        </Link>
                    </CardContent>
                </Card>
            )}

            {/* Recent Migration Batches & 1-Click Rollback */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Migration History &amp; Safe Batch Rollback</CardTitle>
                    <CardDescription>
                        Every import batch is tagged in audit logs and can be rolled back in 1 click before payments are collected.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {batches.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No legacy ERP migration batches have been run in this workspace yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-muted border-b border-border">
                                    <tr>
                                        <th className="p-3 font-semibold">Batch ID</th>
                                        <th className="p-3 font-semibold">Source</th>
                                        <th className="p-3 font-semibold">Imported At</th>
                                        <th className="p-3 font-semibold text-right">Students</th>
                                        <th className="p-3 font-semibold text-right">Opening Invoices</th>
                                        <th className="p-3 font-semibold text-right">Opening ₹</th>
                                        <th className="p-3 font-semibold text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {batches.map((batch) => (
                                        <tr key={batch.batchId}>
                                            <td className="p-3 font-mono">{batch.batchId.slice(0, 8)}</td>
                                            <td className="p-3">
                                                <Badge variant="outline">{batch.sourceErp}</Badge>
                                            </td>
                                            <td className="p-3 text-muted-foreground">{batch.createdAt}</td>
                                            <td className="p-3 text-right tabular-nums">{batch.studentsCreated}</td>
                                            <td className="p-3 text-right tabular-nums">
                                                {batch.openingInvoicesCreated}
                                            </td>
                                            <td className="p-3 text-right tabular-nums">
                                                {formatInr(batch.totalOpeningBalanceInr)}
                                            </td>
                                            <td className="p-3 text-right">
                                                {batch.rolledBack ? (
                                                    <Badge variant="secondary">Rolled Back</Badge>
                                                ) : confirmRollbackId === batch.batchId ? (
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="destructive"
                                                            data-testid={`confirm-rollback-${batch.batchId.slice(0, 8)}`}
                                                            disabled={isPending}
                                                            onClick={() => handleRollback(batch.batchId)}
                                                        >
                                                            Confirm Undo
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setConfirmRollbackId(null)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        data-testid={`rollback-batch-${batch.batchId.slice(0, 8)}`}
                                                        disabled={isPending}
                                                        onClick={() => setConfirmRollbackId(batch.batchId)}
                                                    >
                                                        Rollback Batch
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
