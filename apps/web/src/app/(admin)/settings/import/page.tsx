import { requireAuth } from '@/lib/auth/middleware';
import { listLegacyImportBatchesAction } from '@/lib/actions/legacy-import';
import { Badge } from '@/components/ui/badge';
import { LegacyImportWizardClient } from './import-wizard-client';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: '48-Hour Legacy ERP Data Migration | ScholarMind',
};

export default async function LegacyErpImportPage() {
    await requireAuth('students:read');
    const batches = await listLegacyImportBatchesAction();

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Switch in 48 Hours</Badge>
                    <Badge variant="secondary">Encrypted PII + Atomic Rollback</Badge>
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    Legacy ERP &amp; Spreadsheet Migration Wizard
                </h1>
                <p className="text-muted-foreground">
                    Migrate students, encrypted parent contacts, classes, and opening fee balances from Entab, Fedena, MCB, Edunext, Tally, or Excel with zero downtime.
                </p>
            </div>

            <LegacyImportWizardClient initialBatches={batches} />
        </div>
    );
}
