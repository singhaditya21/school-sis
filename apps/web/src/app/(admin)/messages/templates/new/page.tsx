import Link from 'next/link';
import { getChannelAvailability } from '../../actions';
import TemplateForm from './template-form';

export const dynamic = 'force-dynamic';

export default async function NewMessageTemplatePage() {
    const availability = await getChannelAvailability();

    return (
        <div className="space-y-6">
            <div>
                <Link href="/messages/templates" className="text-sm text-blue-600 hover:underline">
                    ← Back to templates
                </Link>
                <h1 className="mt-2 text-3xl font-bold">New message template</h1>
                <p className="mt-1 text-muted-foreground">
                    Templates are stored per channel and reused when composing.
                </p>
            </div>

            <TemplateForm availability={availability} />
        </div>
    );
}
