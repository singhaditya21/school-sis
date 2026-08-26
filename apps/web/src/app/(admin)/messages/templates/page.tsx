import { MessagesTabs } from '../ui';
import { listMessageTemplates } from '../actions';
import TemplatesClient from './templates-client';

export const dynamic = 'force-dynamic';

export default async function MessageTemplatesPage() {
    const templates = await listMessageTemplates();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Message templates</h1>
                <p className="mt-1 text-slate-600">
                    Reusable SMS, WhatsApp, and email bodies. Placeholders written as{' '}
                    <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{{token}}'}</code>{' '}
                    are recorded with the template and filled in when you compose.
                </p>
            </div>

            <MessagesTabs active="templates" />

            <TemplatesClient templates={templates} />
        </div>
    );
}
