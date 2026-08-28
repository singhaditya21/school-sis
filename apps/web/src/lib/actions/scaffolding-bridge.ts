'use server';

import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

async function tid() { const s = await getSession(); return s.tenantId; }

export async function getTenantId(): Promise<string> { return tid(); }
