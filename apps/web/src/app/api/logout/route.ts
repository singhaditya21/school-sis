import { logoutAction } from '@/lib/actions/auth';
import { assertSameOriginMutation } from '@/lib/security/client-ip';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const csrfError = assertSameOriginMutation(request);
    if (csrfError) {
        return csrfError;
    }
    await logoutAction();
}
