import { getConsentSummary, listConsentForms, listFormResponses, listStudentOptions } from './actions';
import ConsentClient from './consent-client';

export const dynamic = 'force-dynamic';

export default async function ConsentPage({
    searchParams,
}: {
    searchParams: Promise<{ formId?: string }>;
}) {
    const { formId } = await searchParams;

    const [forms, summary] = await Promise.all([listConsentForms(), getConsentSummary()]);

    const selected = formId ? forms.find((form) => form.id === formId) ?? null : null;
    const [responses, students] = selected
        ? await Promise.all([listFormResponses(selected.id), listStudentOptions()])
        : [[], []];

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate(),
    ).padStart(2, '0')}`;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Consent management</h1>
                <p className="mt-1 text-slate-600">
                    Track parent permission for trips, medical treatment, photography, and transport.
                </p>
            </div>

            <ConsentClient
                forms={forms}
                summary={summary}
                selectedForm={selected}
                responses={responses}
                students={students}
                todayIso={todayIso}
            />
        </div>
    );
}
