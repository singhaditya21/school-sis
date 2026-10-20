'use client';

/**
 * @module app/(admin)/settings/objects/blueprint-installer
 *
 * 1-Click Salesforce Education Cloud Institution Blueprint Installer for:
 *   - K-12 Schools (`K12_SCHOOL_CLOUD`)
 *   - Colleges & Universities (`COLLEGE_HIGHER_ED_CLOUD`)
 *   - Coaching & Test-Prep Institutes (`COACHING_INSTITUTE_CLOUD`)
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, GraduationCap, Layers, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    EDUCATION_BLUEPRINT_PACKS,
    type EducationBlueprintId,
} from '@/lib/metadata/blueprints';
import { installEducationBlueprint } from '@/lib/actions/metadata-engine';

export function BlueprintInstaller({
    existingObjectApiNames,
}: {
    existingObjectApiNames: string[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [activePackId, setActivePackId] = useState<EducationBlueprintId | null>(null);
    const existingSet = new Set(existingObjectApiNames.map(s => s.toLowerCase()));

    const handleInstall = (packId: EducationBlueprintId, title: string) => {
        setActivePackId(packId);
        startTransition(async () => {
            const res = await installEducationBlueprint(packId);
            setActivePackId(null);
            if (!res.success) {
                toast.error(res.error || `Failed to install ${title}`);
                return;
            }
            toast.success(
                `Installed ${title}: ${res.installedObjects.length} objects & ${res.installedWorkflows} workflow(s) provisioned.`,
            );
            router.refresh();
        });
    };

    return (
        <Card className="border-primary/20 bg-accent/20" data-testid="education-cloud-blueprints">
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <GraduationCap className="w-5 h-5 text-primary" />
                            Education Cloud Institution Blueprints (1-Click Packs)
                        </CardTitle>
                        <CardDescription>
                            Provision pre-architected objects, relational lookups, formulas, roll-up
                            summaries, Kanban layouts, and workflows for K-12 Schools, Colleges, or
                            Coaching Institutes.
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit font-mono text-xs">
                        Salesforce EDA Parity
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {EDUCATION_BLUEPRINT_PACKS.map(pack => {
                        const installedCount = pack.objects.filter(o =>
                            existingSet.has(o.apiName.toLowerCase()),
                        ).length;
                        const allInstalled = installedCount === pack.objects.length;
                        const isInstallingThis = isPending && activePackId === pack.id;

                        return (
                            <div
                                key={pack.id}
                                data-testid={`blueprint-card-${pack.id}`}
                                className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between gap-4 shadow-sm"
                            >
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                                                {pack.institutionType}
                                            </span>
                                            <h3 className="font-bold text-base text-foreground mt-0.5">
                                                {pack.title}
                                            </h3>
                                        </div>
                                        {allInstalled ? (
                                            <Badge
                                                variant="outline"
                                                className="bg-success-subtle text-success border-success/30 text-[11px] shrink-0"
                                            >
                                                Installed
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-[11px] shrink-0">
                                                {installedCount}/{pack.objects.length} Objects
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {pack.tagline}
                                    </p>
                                    <div className="space-y-1.5 pt-1">
                                        {pack.objects.map(obj => {
                                            const isReady = existingSet.has(
                                                obj.apiName.toLowerCase(),
                                            );
                                            return (
                                                <div
                                                    key={obj.apiName}
                                                    className="flex items-center justify-between text-xs rounded-md bg-muted/50 px-2.5 py-1.5"
                                                >
                                                    <span className="font-medium text-foreground flex items-center gap-1.5">
                                                        {isReady ? (
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                                                        ) : (
                                                            <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                        )}
                                                        {obj.name}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                        {obj.fields.length} fields
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <Button
                                    size="sm"
                                    variant={allInstalled ? 'outline' : 'default'}
                                    disabled={isPending}
                                    onClick={() => handleInstall(pack.id, pack.title)}
                                    data-testid={`install-blueprint-${pack.id}`}
                                    className="w-full"
                                >
                                    {isInstallingThis ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                            Provisioning Pack...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                                            {allInstalled
                                                ? 'Re-Sync Blueprint Pack'
                                                : `Install ${pack.institutionType} Pack`}
                                        </>
                                    )}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
