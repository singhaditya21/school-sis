import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { logAudit } from '@/lib/audit';

/**
 * Lists all PUBLISHED metadata objects visible to the authenticated tenant
 * so mobile and external API clients can discover standard & custom LCNC objects.
 */
export async function GET() {
    try {
        const auth = await requireApiPermission('metadata:read');
        if (auth.ok === false) return auth.response;

        const tenantId = auth.context.tenantId;

        const objects = await sql<{
            id: string;
            name: string;
            apiName: string;
            tableName: string;
            isCustom: boolean;
            version: number;
        }>`
            SELECT id,
                   name,
                   "apiName",
                   "tableName",
                   "isCustom",
                   version
            FROM (
                SELECT DISTINCT ON (api_name)
                       id,
                       name,
                       api_name AS "apiName",
                       table_name AS "tableName",
                       COALESCE(is_custom, false) AS "isCustom",
                       version
                FROM metadata_objects
                WHERE status = 'PUBLISHED'
                  AND (
                    tenant_id = ${tenantId}
                    OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                  )
                ORDER BY api_name, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
            ) resolved_objects
            ORDER BY "isCustom" DESC, name ASC
        `;

        await logAudit({
            tenantId,
            userId: auth.context.userId,
            action: 'READ',
            entityType: 'metadata_objects',
            description: `Listed ${objects.length} published metadata object(s)`,
            afterState: { count: objects.length },
        });

        return NextResponse.json({ objects });
    } catch (error) {
        console.error('Metadata Objects GET Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
