'use client';

/**
 * Invoice Generation Form — Bulk and individual invoice creation
 */

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileText, Users, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { InvoicePreview } from '@/lib/actions/invoice-generation';

// ─── Currency Formatter ──────────────────────────────────────

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}

// ─── Types ───────────────────────────────────────────────────

interface FeePlanOption {
    id: string;
    name: string;
    isActive: boolean;
}

interface GradeOption {
    id: string;
    name: string;
}

interface GenerationResult {
    success: boolean;
    generated: number;
    skipped: number;
    errors: string[];
}

// ─── Main Component ──────────────────────────────────────────

export default function InvoiceGenerationForm({
    feePlans,
    grades,
    onGenerate,
    onPreview,
}: {
    feePlans: FeePlanOption[];
    grades: GradeOption[];
    onGenerate: (data: {
        feePlanId: string;
        gradeId?: string;
        dueDate: string;
        description?: string;
    }) => Promise<GenerationResult>;
    onPreview: (feePlanId: string, gradeId?: string) => Promise<InvoicePreview | null>;
}) {
    const [feePlanId, setFeePlanId] = useState('');
    const [gradeId, setGradeId] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [description, setDescription] = useState('');
    const [preview, setPreview] = useState<InvoicePreview | null>(null);
    const [result, setResult] = useState<GenerationResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handlePreview = () => {
        if (!feePlanId) return;
        startTransition(async () => {
            const p = await onPreview(feePlanId, gradeId || undefined);
            setPreview(p);
            setResult(null);
        });
    };

    const handleGenerate = () => {
        if (!feePlanId || !dueDate) return;
        startTransition(async () => {
            const r = await onGenerate({
                feePlanId,
                gradeId: gradeId || undefined,
                dueDate,
                description: description || undefined,
            });
            setResult(r);
        });
    };

    // Default due date to 30 days from now
    const defaultDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Generate Invoices
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Create invoices in bulk for a fee plan
                </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Fee Plan Select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Fee Plan *
                        </label>
                        <select
                            value={feePlanId}
                            onChange={(e) => {
                                setFeePlanId(e.target.value);
                                setPreview(null);
                                setResult(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">Select fee plan</option>
                            {feePlans.filter(p => p.isActive).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Grade Filter */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Grade (optional — all grades if empty)
                        </label>
                        <select
                            value={gradeId}
                            onChange={(e) => {
                                setGradeId(e.target.value);
                                setPreview(null);
                                setResult(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">All grades</option>
                            {grades.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Due Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Due Date *
                        </label>
                        <input
                            type="date"
                            value={dueDate || defaultDueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Description (optional)
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g., Quarter 1 Fees"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mt-6">
                    <button
                        onClick={handlePreview}
                        disabled={!feePlanId || isPending}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                        Preview
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={!feePlanId || !dueDate || isPending}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        Generate Invoices
                    </button>
                </div>
            </div>

            {/* Preview */}
            {preview && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-6">
                    <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">
                        Preview: {preview.feePlanName}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Students</p>
                            <p className="font-bold text-lg">{preview.studentCount}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Per Student</p>
                            <p className="font-bold text-lg">{formatCurrency(preview.totalPerStudent)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Components</p>
                            <p className="font-bold text-lg">{preview.components.length}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Estimated Total</p>
                            <p className="font-bold text-lg text-blue-600 dark:text-blue-400">
                                {formatCurrency(preview.estimatedTotal)}
                            </p>
                        </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="space-y-1">
                        {preview.components.map((c, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{c.name}</span>
                                <span className="font-medium">{formatCurrency(c.amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className={`rounded-xl border p-6 ${result.success
                        ? 'border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30'
                        : 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30'
                    }`}>
                    <div className="flex items-center gap-2 mb-3">
                        {result.success ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                        )}
                        <h3 className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'
                            }`}>
                            {result.success ? 'Invoices Generated Successfully' : 'Generation Failed'}
                        </h3>
                    </div>
                    <div className="flex gap-4 text-sm">
                        <Badge variant="outline" className="text-green-700 dark:text-green-300">
                            {result.generated} generated
                        </Badge>
                        {result.skipped > 0 && (
                            <Badge variant="outline" className="text-orange-700 dark:text-orange-300">
                                {result.skipped} skipped
                            </Badge>
                        )}
                    </div>
                    {result.errors.length > 0 && (
                        <div className="mt-3 text-xs text-red-600 dark:text-red-400 space-y-1">
                            {result.errors.slice(0, 5).map((err, i) => (
                                <p key={i}>• {err}</p>
                            ))}
                            {result.errors.length > 5 && (
                                <p>...and {result.errors.length - 5} more</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
