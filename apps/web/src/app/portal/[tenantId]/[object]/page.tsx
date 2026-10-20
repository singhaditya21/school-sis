import { getPublicPortalIntakeSchema } from '@/lib/actions/metadata-engine';
import PortalIntakeClient from './portal-intake-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function ExperienceCloudPublicPortalPage({
    params,
}: {
    params: Promise<{ tenantId: string; object: string }>;
}) {
    const resolved = await params;
    const schema = await getPublicPortalIntakeSchema(resolved.tenantId, resolved.object);

    if (!schema || !schema.enabled) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <div
                    className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center space-y-2 shadow-sm"
                    data-testid="portal-unavailable-card"
                >
                    <h1 className="text-xl font-bold text-foreground">
                        Portal Currently Unavailable
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        This Experience Cloud Web-to-Object intake form has not been published yet or has been temporarily closed by the institution administrator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <PortalIntakeClient
            tenantId={resolved.tenantId}
            objectApiName={resolved.object}
            schema={schema}
        />
    );
}
