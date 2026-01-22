'use server';

import { getSession } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';
import { redirect } from 'next/navigation';

export async function POST() {
    await logoutAction();
}
