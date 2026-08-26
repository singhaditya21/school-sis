import {
    getChannelAvailability,
    listGradeOptions,
    listGuardianRecipients,
    listMessageTemplates,
} from '../actions';
import { MessagesTabs } from '../ui';
import ComposeClient from './compose-client';

export const dynamic = 'force-dynamic';

export default async function ComposeMessagePage({
    searchParams,
}: {
    searchParams: Promise<{ templateId?: string }>;
}) {
    const { templateId } = await searchParams;

    const [availability, templates, grades, recipients] = await Promise.all([
        getChannelAvailability(),
        listMessageTemplates(),
        listGradeOptions(),
        listGuardianRecipients(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Compose message</h1>
                <p className="mt-1 text-slate-600">
                    Build a message, choose recipients, and place it in the notification outbox.
                </p>
            </div>

            <MessagesTabs active="compose" />

            <ComposeClient
                availability={availability}
                templates={templates.filter((template) => template.isActive)}
                grades={grades}
                recipients={recipients}
                initialTemplateId={templateId ?? null}
            />
        </div>
    );
}
