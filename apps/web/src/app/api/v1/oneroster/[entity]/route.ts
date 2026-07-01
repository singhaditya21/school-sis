import { handleOneRosterGet } from '@/lib/integrations/oneroster';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ entity: string }> }) {
    return handleOneRosterGet(request, context);
}
