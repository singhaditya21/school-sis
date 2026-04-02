

import { getSession } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';
import { redirect } from 'next/navigation';

export const dynamic = "force-dynamic";

export async function POST() {
    await logoutAction();
}
