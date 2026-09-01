import { ConsentForms } from '@/components/parent/consent-forms';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { getChildConsentForms, getMyChildren } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParentConsentPage({
    searchParams,
}: {
    searchParams: Promise<{ child?: string }>;
}) {
    const { child: requestedChild } = await searchParams;
    const students = await getMyChildren();
    const data = await getChildConsentForms(requestedChild);

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <ParentTopBar students={students} selectedId={data?.child.id ?? null} />

            <div className="border-b border-border pb-4">
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
                    <span className="text-teal-600">🛡️</span> Consent forms
                </h1>
                <p className="mt-1 text-muted-foreground">
                    {data
                        ? `Permissions and waivers the school has asked you to answer for ${data.child.name}.`
                        : 'Permissions and waivers the school has asked you to answer.'}
                </p>
            </div>

            {data ? (
                <ConsentForms forms={data.forms} studentId={data.child.id} studentName={data.child.name} />
            ) : (
                <div className="rounded-xl border border-dashed bg-card p-12 text-center text-muted-foreground">
                    No child is linked to your account yet, so there are no consent forms to answer.
                </div>
            )}
        </div>
    );
}
