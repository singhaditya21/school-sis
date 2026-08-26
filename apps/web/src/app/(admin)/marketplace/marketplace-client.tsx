'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Info, Loader2, Plus } from 'lucide-react';
import { setModuleActiveAction, type ModuleEntitlements } from './actions';
import { GATED_MODULES, RECORDED_MODULES, type ModuleDefinition } from './catalogue';

function ModuleCard({
    module,
    isActive,
    isBusy,
    canEdit,
    onToggle,
}: {
    module: ModuleDefinition;
    isActive: boolean;
    isBusy: boolean;
    canEdit: boolean;
    onToggle: (code: string, next: boolean) => void;
}) {
    return (
        <Card
            className={`relative flex h-full flex-col border-2 transition-all ${
                isActive ? 'border-blue-500' : 'border-transparent shadow-sm hover:shadow-md'
            }`}
        >
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{module.title}</CardTitle>
                    {isActive && (
                        <Badge className="shrink-0 border-0 bg-blue-100 text-blue-700 hover:bg-blue-100">
                            <Check className="mr-1 h-3 w-3" /> Enabled
                        </Badge>
                    )}
                </div>
                <CardDescription>{module.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex-grow space-y-2 pb-4 text-xs text-muted-foreground">
                <p className="font-mono text-[11px] text-slate-400">{module.code}</p>
                {module.gatedRoute ? (
                    <p>
                        Controls access to <span className="font-mono">{module.gatedRoute}</span>.
                    </p>
                ) : (
                    <p>Recorded on the company record; no route currently checks it.</p>
                )}
                {module.note && <p>{module.note}</p>}
            </CardContent>

            <CardFooter>
                <Button
                    variant={isActive ? 'outline' : 'default'}
                    className="w-full"
                    disabled={!canEdit || isBusy}
                    onClick={() => onToggle(module.code, !isActive)}
                >
                    {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isActive ? (
                        'Disable'
                    ) : (
                        <>
                            <Plus className="mr-2 h-4 w-4" /> Enable
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function MarketplaceClient({
    entitlements,
}: {
    entitlements: ModuleEntitlements;
}) {
    const router = useRouter();
    const [active, setActive] = useState<string[]>(entitlements.activeModules);
    const [busyCode, setBusyCode] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const canEdit = entitlements.linked;

    const handleToggle = async (code: string, next: boolean) => {
        setBusyCode(code);
        try {
            const result = await setModuleActiveAction(code, next);

            if (!result.success) {
                toast.error(result.error || 'Could not update this module.');
                return;
            }

            setActive(result.activeModules ?? active);
            toast.success(
                next
                    ? `${code} enabled. Users must sign in again for it to take effect.`
                    : `${code} disabled. Users must sign in again for it to take effect.`,
            );
            startTransition(() => router.refresh());
        } catch {
            toast.error('Could not update this module.');
        } finally {
            setBusyCode(null);
        }
    };

    const renderGroup = (modules: ModuleDefinition[]) => (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {modules.map((module) => (
                <ModuleCard
                    key={module.code}
                    module={module}
                    isActive={active.includes(module.code)}
                    isBusy={busyCode === module.code}
                    canEdit={canEdit}
                    onToggle={handleToggle}
                />
            ))}
        </div>
    );

    return (
        <div className="space-y-8">
            {!canEdit ? (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                        <p className="font-semibold">Entitlements are read-only for this school.</p>
                        <p>
                            Module access is stored on the billing company record, and this school
                            is not linked to one. Ask your platform operator to attach it to a
                            company before changing modules here.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="space-y-1">
                        <p>
                            Entitlements apply to{' '}
                            <span className="font-medium">{entitlements.companyName}</span>
                            {entitlements.subscriptionTier
                                ? ` (${entitlements.subscriptionTier} tier)`
                                : ''}{' '}
                            and every school under it.
                        </p>
                        <p>
                            Access is read from the signed-in session, so a change takes effect the
                            next time a user signs in.
                        </p>
                    </div>
                </div>
            )}

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Access-controlling modules
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        These entitlements decide whether a section of the app opens or redirects
                        to the upgrade page.
                    </p>
                </div>
                {renderGroup(GATED_MODULES)}
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Recorded entitlements
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Stored against the company for billing and reporting. Nothing in this
                        release gates a screen on them, so turning one off does not hide any
                        feature.
                    </p>
                </div>
                {renderGroup(RECORDED_MODULES)}
            </section>

            {entitlements.unknownModules.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unrecognised codes
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Stored on the company record but not recognised by this build, so they have
                        no effect:
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {entitlements.unknownModules.map((code) => (
                            <Badge key={code} variant="outline" className="font-mono text-xs">
                                {code}
                            </Badge>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
