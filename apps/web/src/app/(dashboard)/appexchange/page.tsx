import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Layers, PackageCheck, ShieldCheck, Store } from 'lucide-react';
import { requireAuth } from '@/lib/auth/middleware';
import { listTenantObjectCatalog } from '@/lib/actions/lcnc-platform';
import { listInstalledMetadataPackagesAction } from '@/lib/actions/lcnc-tier3';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BlueprintInstaller } from '@/app/(admin)/settings/objects/blueprint-installer';
import { SchemaPackageStudio } from '@/app/(admin)/settings/objects/schema-package-studio';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AppExchangePage() {
    try {
        await requireAuth('metadata:read');
    } catch {
        redirect('/unauthorized');
    }

    const [catalogRes, packagesRes] = await Promise.all([
        listTenantObjectCatalog().catch(() => ({ success: false, objects: [] })),
        listInstalledMetadataPackagesAction().catch(() => ({
            success: false,
            tenantCode: null,
            packages: [],
        })),
    ]);

    const allObjects = catalogRes.objects || [];
    const customObjects = allObjects
        .filter(o => o.isTenantDefinedEav)
        .map(o => ({ apiName: o.apiName, name: o.name }));
    const existingObjectApiNames = allObjects.map(o => o.apiName);
    const installedPackages = packagesRes.packages || [];

    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-6" data-testid="appexchange-hub">
            {/* Hero Header */}
            <div className="rounded-2xl border border-primary/20 bg-card p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                                <Store className="h-6 w-6" />
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                                ScholarMind AppExchange &amp; Package Registry
                            </h1>
                            <Badge variant="outline" className="font-mono text-xs">
                                Native Bundle v2
                            </Badge>
                        </div>
                        <p className="max-w-3xl text-sm text-muted-foreground leading-relaxed">
                            Install pre-architected Education Cloud Institution Blueprints, inspect
                            cryptographic SHA-256 package provenance across campuses, or dry-run and
                            deploy portable <code className="font-mono">.scholarmind.json</code>{' '}
                            governance bundles (Objects, Fields, Layouts, OWD, Sharing Rules,
                            Validation Formulas, Multi-Step Approvals, and Workflows).
                        </p>
                    </div>
                    <Link
                        href="/settings/objects"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
                    >
                        Object Manager <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </Link>
                </div>

                {/* KPI Summary Strip */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center gap-3">
                        <PackageCheck className="h-5 w-5 text-primary shrink-0" />
                        <div>
                            <div className="text-xs text-muted-foreground">
                                Installed Packages &amp; Blueprints
                            </div>
                            <div className="text-xl font-bold text-foreground">
                                {installedPackages.length}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center gap-3">
                        <Layers className="h-5 w-5 text-success shrink-0" />
                        <div>
                            <div className="text-xs text-muted-foreground">
                                Active Custom EAV Objects
                            </div>
                            <div className="text-xl font-bold text-foreground">
                                {customObjects.length}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                        <div>
                            <div className="text-xs text-muted-foreground">
                                Governance Gate
                            </div>
                            <div className="text-sm font-semibold text-foreground">
                                4-Eyes Publish Approval + SHA-256 Provenance
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Installed Packages Registry */}
            <Card className="border-border shadow-sm" data-testid="installed-packages-registry">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <PackageCheck className="h-5 w-5 text-primary" />
                                Installed Packages &amp; Blueprint Provenance
                            </CardTitle>
                            <CardDescription>
                                Live tenant registry of Education Cloud Blueprints and imported{' '}
                                <code className="font-mono">.scholarmind.json</code> bundles.
                            </CardDescription>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                            {installedPackages.length} Installed
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    {installedPackages.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-muted/15 p-6 text-center text-xs text-muted-foreground">
                            No packages have been installed yet in this tenant. Provision a 1-Click
                            Education Cloud Blueprint below or import a{' '}
                            <code className="font-mono">.scholarmind.json</code> bundle.
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {installedPackages.map(pkg => (
                                <div
                                    key={pkg.id}
                                    className="rounded-xl border border-border bg-background p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                                >
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                                            <span className="font-semibold text-sm text-foreground">
                                                {pkg.name}
                                            </span>
                                            <Badge variant="outline" className="text-[10px] font-mono">
                                                v{pkg.version}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[10px]">
                                                {pkg.sourceType}
                                            </Badge>
                                        </div>
                                        {pkg.description && (
                                            <p className="text-xs text-muted-foreground">
                                                {pkg.description}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                            {pkg.installedObjects.map(objApi => (
                                                <Link
                                                    key={objApi}
                                                    href={`/app/${objApi}`}
                                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-foreground hover:border-primary/40"
                                                >
                                                    {objApi}
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right space-y-1 shrink-0">
                                        <div className="font-mono text-[11px] text-muted-foreground">
                                            SHA-256: {pkg.bundleSha256.slice(0, 14)}…
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                            Updated {new Date(pkg.updatedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 1-Click Education Cloud Blueprints */}
            <BlueprintInstaller existingObjectApiNames={existingObjectApiNames} />

            {/* Native Schema Package Studio (Export, Dry-Run Preview & Import, AI Schema Copilot) */}
            <SchemaPackageStudio customObjects={customObjects} />
        </div>
    );
}
