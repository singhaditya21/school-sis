'use client';

/**
 * @module app/(admin)/settings/objects/schema-package-studio
 *
 * Track D — Native Schema Package Studio (Vercel + Neon Self-Hosted):
 * Enables exporting any set of Custom Objects, Fields, Validation Rules, Layouts,
 * and Workflows as a portable `.scholarmind.json` Schema Bundle and importing/deploying
 * bundles across campuses or from Staging to Production in one click.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    CheckCircle2,
    Copy,
    Download,
    Package,
    Upload,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    exportTenantSchemaBundle,
    importTenantSchemaBundle,
} from '@/lib/actions/metadata-engine';

export function SchemaPackageStudio({
    customObjects,
}: {
    customObjects: { apiName: string; name: string }[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [mode, setMode] = useState<'EXPORT' | 'IMPORT'>('EXPORT');

    // Export state
    const [bundleName, setBundleName] = useState('Campus Production Release v1');
    const [bundleDescription, setBundleDescription] = useState(
        'Portable ScholarMind schema package for Vercel + Neon deployment',
    );
    const [selectedApis, setSelectedApis] = useState<string[]>(
        customObjects.map(o => o.apiName),
    );
    const [exportedJson, setExportedJson] = useState<string>('');

    // Import state
    const [importJsonText, setImportJsonText] = useState<string>('');

    const toggleObjectSelection = (apiName: string) => {
        setSelectedApis(prev =>
            prev.includes(apiName) ? prev.filter(a => a !== apiName) : [...prev, apiName],
        );
    };

    const handleExportBundle = () => {
        if (selectedApis.length === 0) {
            toast.error('Select at least one custom object to package.');
            return;
        }
        startTransition(async () => {
            const res = await exportTenantSchemaBundle({
                bundleName,
                bundleDescription,
                objectApiNames: selectedApis,
            });
            if (!res.success || !res.bundle) {
                toast.error(res.error || 'Failed to export schema bundle.');
                return;
            }
            const pretty = JSON.stringify(res.bundle, null, 2);
            setExportedJson(pretty);

            if (typeof window !== 'undefined') {
                const blob = new Blob([pretty], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const slug = bundleName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
                a.href = url;
                a.download = `${slug || 'campus-schema'}.scholarmind.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
            toast.success(
                `Exported ${res.bundle.objects.length} object(s) & ${res.bundle.workflows.length} workflow(s) to .scholarmind.json`,
            );
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            setImportJsonText(text);
            toast.success(`Loaded ${file.name}`);
        } catch {
            toast.error('Could not read bundle file.');
        }
    };

    const handleImportBundle = () => {
        if (!importJsonText.trim()) {
            toast.error('Paste or upload a .scholarmind.json bundle first.');
            return;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(importJsonText);
        } catch {
            toast.error('Invalid JSON syntax in schema bundle.');
            return;
        }

        startTransition(async () => {
            const res = await importTenantSchemaBundle(parsed);
            if (!res.success) {
                toast.error(res.error || 'Schema bundle deployment failed.');
                return;
            }
            toast.success(
                `Deployed ${res.importedObjects.length} object(s), ${res.importedFields} new field(s), and ${res.importedWorkflows} workflow(s)!`,
            );
            setImportJsonText('');
            router.refresh();
        });
    };

    return (
        <Card className="border-border shadow-sm" data-testid="schema-package-studio">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" />
                        <CardTitle className="text-lg">
                            Schema Package Studio — Sandbox-to-Production &amp; Multi-Campus Bundles
                        </CardTitle>
                        <Badge variant="outline" className="font-mono text-[10px]">
                            .scholarmind.json
                        </Badge>
                    </div>
                    <CardDescription>
                        Export or deploy custom objects, fields, validation rules, layouts, and workflows across Neon PostgreSQL environments or campuses with zero external marketplace fees.
                    </CardDescription>
                </div>
                <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-xs shrink-0">
                    <button
                        type="button"
                        onClick={() => setMode('EXPORT')}
                        data-testid="package-studio-tab-export"
                        className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                            mode === 'EXPORT'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Export Package
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('IMPORT')}
                        data-testid="package-studio-tab-import"
                        className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                            mode === 'IMPORT'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Import / Deploy Package
                    </button>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                {mode === 'EXPORT' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Package Name</Label>
                                <Input
                                    value={bundleName}
                                    onChange={e => setBundleName(e.target.value)}
                                    placeholder="e.g. Coaching Institute Campus Pack v1"
                                    data-testid="bundle-name-input"
                                    className="text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Release Notes / Description</Label>
                                <Input
                                    value={bundleDescription}
                                    onChange={e => setBundleDescription(e.target.value)}
                                    placeholder="Describe included objects and workflows..."
                                    className="text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">
                                Custom Objects Included ({selectedApis.length} of {customObjects.length})
                            </Label>
                            {customObjects.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Install an Education Cloud Blueprint above or create a Custom Object first to export a bundle.
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
                                    {customObjects.map(obj => {
                                        const selected = selectedApis.includes(obj.apiName);
                                        return (
                                            <button
                                                key={obj.apiName}
                                                type="button"
                                                onClick={() => toggleObjectSelection(obj.apiName)}
                                                data-testid={`bundle-select-object-${obj.apiName}`}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                                                    selected
                                                        ? 'bg-primary text-primary-foreground border-primary'
                                                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                                }`}
                                            >
                                                {selected && <CheckCircle2 className="w-3 h-3" />}
                                                <span>{obj.name}</span>
                                                <span className="font-mono text-[10px] opacity-75">
                                                    ({obj.apiName})
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="text-[11px] text-muted-foreground">
                                Webhook signing secrets and API keys are automatically redacted (`[REDACTED]`) on export.
                            </span>
                            <div className="flex items-center gap-2">
                                {exportedJson && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            navigator.clipboard?.writeText(exportedJson);
                                            toast.success('Bundle JSON copied to clipboard!');
                                        }}
                                        className="text-xs gap-1.5"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        Copy JSON
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isPending || customObjects.length === 0}
                                    onClick={handleExportBundle}
                                    data-testid="export-schema-bundle-btn"
                                    className="text-xs gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {isPending
                                        ? 'Packaging...'
                                        : 'Export .scholarmind.json Bundle'}
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <Label className="text-xs">
                                Upload `.scholarmind.json` File or Paste Bundle JSON
                            </Label>
                            <Input
                                type="file"
                                accept=".json,application/json"
                                onChange={handleFileUpload}
                                className="h-8 text-xs max-w-xs"
                            />
                        </div>
                        <textarea
                            rows={6}
                            value={importJsonText}
                            onChange={e => setImportJsonText(e.target.value)}
                            placeholder='{"formatVersion": "scholarmind.bundle.v1", "bundleName": "...", "objects": [...], "workflows": [...]}'
                            data-testid="import-schema-bundle-textarea"
                            className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                size="sm"
                                disabled={isPending || !importJsonText.trim()}
                                onClick={handleImportBundle}
                                data-testid="import-schema-bundle-btn"
                                className="text-xs gap-1.5"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                {isPending
                                    ? 'Deploying to Neon...'
                                    : 'Deploy Schema Bundle to Tenant'}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
