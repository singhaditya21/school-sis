'use client';

import { useState, useTransition } from 'react';
import { Award, CheckCircle2, Lock, Stamp } from 'lucide-react';
import { BOARD_PRESETS, type BoardPreset } from '@/lib/academics/board-grading';
import type { ReportCardStudioPolicy } from '@/lib/academics/report-card-policy';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { updateReportCardStudioPolicyAction } from '../_actions/report-cards';

const BOARD_KEYS: BoardPreset[] = ['CBSE', 'ICSE', 'NEP_2020_HPC', 'IB'];

export function StudioPolicyClient({ initialPolicy }: { initialPolicy: ReportCardStudioPolicy }) {
    const [board, setBoard] = useState<BoardPreset>(initialPolicy.affiliationBoard);
    const [holdFees, setHoldFees] = useState<boolean>(initialPolicy.holdOnOverdueFees);
    const [principalName, setPrincipalName] = useState<string>(initialPolicy.principalName);
    const [showCoScholastic, setShowCoScholastic] = useState<boolean>(initialPolicy.showCoScholastic);
    const [savedNotice, setSavedNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const activeDef = BOARD_PRESETS[board];

    function handleSave() {
        setSavedNotice(null);
        setError(null);
        startTransition(async () => {
            const res = await updateReportCardStudioPolicyAction({
                boardPreset: board,
                holdOnOverdueFees: holdFees,
                principalName,
                showCoScholastic,
            });
            if (!res.ok) {
                setError(res.error || 'Could not save report card policy.');
                return;
            }
            setSavedNotice(`Saved ${BOARD_PRESETS[board].shortLabel} template & governance policy.`);
        });
    }

    return (
        <Card data-testid="report-card-studio-policy" className="border-brass/40 bg-accent/25 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Award className="h-5 w-5 text-brass" />
                        Board-Compliant Report Card Studio
                    </CardTitle>
                    <Badge variant="outline" className="border-brass/40 bg-card text-primary font-semibold">
                        Active Framework: {activeDef.shortLabel}
                    </Badge>
                </div>
                <CardDescription>
                    Configure your school&apos;s official board grading preset, component weightages, digital Principal signature stamp, and optional fee-arrears parent download hold.
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Board Preset Selector */}
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {BOARD_KEYS.map((key) => {
                        const def = BOARD_PRESETS[key];
                        const selected = key === board;
                        return (
                            <button
                                key={key}
                                type="button"
                                data-testid={`board-preset-${key.toLowerCase()}`}
                                onClick={() => setBoard(key)}
                                className={`rounded-xl border p-3.5 text-left transition-all ${
                                    selected
                                        ? 'border-brass bg-primary text-primary-foreground shadow-sm'
                                        : 'border-border bg-card text-foreground hover:border-brass/45'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-sm">{def.shortLabel}</span>
                                    {selected && <CheckCircle2 className="h-4 w-4 text-brass" />}
                                </div>
                                <p
                                    className={`mt-1 text-[11px] leading-snug ${
                                        selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                                    }`}
                                >
                                    {def.weightageSummary}
                                </p>
                            </button>
                        );
                    })}
                </div>

                {/* Governance Controls */}
                <div className="grid gap-4 pt-1 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <label
                            htmlFor="principal-signature-input"
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"
                        >
                            <Stamp className="h-3.5 w-3.5 text-brass" />
                            Digital Principal Stamp
                        </label>
                        <Input
                            id="principal-signature-input"
                            value={principalName}
                            onChange={(e) => setPrincipalName(e.target.value)}
                            placeholder="Dr. Meera Raghavan, Principal"
                            className="bg-card"
                        />
                    </div>

                    <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showCoScholastic}
                            onChange={(e) => setShowCoScholastic(e.target.checked)}
                            className="mt-1 h-4 w-4 accent-primary"
                        />
                        <div className="text-xs">
                            <p className="font-semibold text-foreground">
                                Include Co-Scholastic &amp; 360° Rubric
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                                Prints NEP 2020 / SEWA holistic learner dispositions alongside subject marks.
                            </p>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 cursor-pointer">
                        <input
                            type="checkbox"
                            data-testid="toggle-fee-defaulter-hold"
                            checked={holdFees}
                            onChange={(e) => setHoldFees(e.target.checked)}
                            className="mt-1 h-4 w-4 accent-primary"
                        />
                        <div className="text-xs">
                            <p className="font-semibold text-foreground flex items-center gap-1">
                                <Lock className="h-3.5 w-3.5 text-brass" />
                                Hold Parent Download on Overdue Fees
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                                Prompts parents with past-due invoices to clear arrears via 1-tap UPI first.
                            </p>
                        </div>
                    </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xs">
                        {savedNotice && <span className="font-semibold text-success">{savedNotice}</span>}
                        {error && <span className="font-semibold text-destructive">{error}</span>}
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        data-testid="save-report-card-policy"
                        disabled={isPending}
                        onClick={handleSave}
                    >
                        {isPending ? 'Saving Studio Policy…' : 'Save Board & Governance Policy'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
