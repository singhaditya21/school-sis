import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import SettingsClient from './client-page';

export const metadata = {
    title: 'Global Policy Engine | ScholarMind HQ',
};

export default async function SettingsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    return <SettingsClient />;
}
