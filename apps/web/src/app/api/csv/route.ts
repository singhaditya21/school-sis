import { NextRequest, NextResponse } from 'next/server';
import { runWithTenantContext, sql } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { parse } from 'csv-parse/sync';
import { getLimit } from '@/lib/config/limits';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import { logger } from '@/lib/observability/logger';

export const dynamic = "force-dynamic";

/**
 * CSV Import/Export API
 *
 * POST /api/csv/import — Bulk import students or fees from CSV
 * GET  /api/csv/export — Export data as CSV
 */

// ─── EXPORT ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity');
    const permissionByEntity: Record<string, string> = {
        students: 'students:read',
        fees: 'fees:read',
        attendance: 'attendance:read',
    };
    const permission = entity ? permissionByEntity[entity] : undefined;
    if (!permission) {
        return NextResponse.json(
            { error: 'Invalid entity. Valid: students, fees, attendance' },
            { status: 400 }
        );
    }
    const auth = await requireApiPermission(permission);
    if (auth.ok === false) return auth.response;
    const tenantId = auth.context.tenantId;
    const maxExportRows = getLimit('CSV_EXPORT_MAX_ROWS');

    try {
        const csvContent = await runWithTenantContext(tenantId, async () => {
            switch (entity) {
                case 'students': {
                    const rows = await sql<Record<string, unknown>>`
                        SELECT
                            s.admission_number, s.first_name, s.last_name, s.gender,
                            s.date_of_birth, s.category, s.religion,
                            s.address, s.city, s.state, s.pincode,
                            g.name AS grade, sec.name AS section, s.status
                        FROM students s
                        LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
                        LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
                        WHERE s.tenant_id = ${tenantId}
                        ORDER BY g.display_order, sec.name, s.first_name
                        LIMIT ${maxExportRows}
                    `;

                    return toCSV(rows, [
                        'admission_number', 'first_name', 'last_name', 'gender',
                        'date_of_birth', 'category', 'religion',
                        'address', 'city', 'state', 'pincode',
                        'grade', 'section', 'status',
                    ]);
                }

                case 'fees': {
                    const rows = await sql<Record<string, unknown>>`
                        SELECT
                            i.invoice_number, s.admission_number,
                            s.first_name || ' ' || s.last_name AS student_name,
                            g.name AS grade,
                            i.total_amount, i.paid_amount,
                            i.total_amount - i.paid_amount AS balance,
                            i.due_date, i.status
                        FROM invoices i
                        JOIN students s ON s.id = i.student_id AND s.tenant_id = ${tenantId}
                        LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
                        LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
                        WHERE i.tenant_id = ${tenantId}
                        ORDER BY i.due_date DESC
                        LIMIT ${maxExportRows}
                    `;

                    return toCSV(rows, [
                        'invoice_number', 'admission_number', 'student_name', 'grade',
                        'total_amount', 'paid_amount', 'balance', 'due_date', 'status',
                    ]);
                }

                case 'attendance': {
                    const rows = await sql<Record<string, unknown>>`
                        SELECT
                            s.admission_number,
                            s.first_name || ' ' || s.last_name AS student_name,
                            g.name AS grade,
                            ar.date, ar.status, ar.remarks
                        FROM attendance_records ar
                        JOIN students s ON s.id = ar.student_id AND s.tenant_id = ${tenantId}
                        LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
                        LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
                        WHERE ar.tenant_id = ${tenantId}
                        ORDER BY ar.date DESC, g.display_order, s.first_name
                        LIMIT ${maxExportRows}
                    `;

                    return toCSV(rows, [
                        'admission_number', 'student_name', 'grade', 'date', 'status', 'remarks',
                    ]);
                }

                default:
                    return '';
            }
        });

        if (!csvContent) {
            return NextResponse.json(
                { error: 'Invalid entity. Valid: students, fees, attendance' },
                { status: 400 }
            );
        }

        return new NextResponse(csvContent, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${entity}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: unknown) {
        logger.error('csv_api.export_failed', 'CSV export failed', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}

// ─── IMPORT ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const auth = await requireApiPermission('students:write');
    if (auth.ok === false) return auth.response;
    const tenantId = auth.context.tenantId;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const entity = formData.get('entity') as string;

        if (!file || !entity) {
            return NextResponse.json({ error: 'File and entity are required' }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            return NextResponse.json({ error: 'Only CSV files are supported' }, { status: 400 });
        }

        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 400 });
        }

        const text = await file.text();
        const records = parse(text, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }) as Array<Record<string, string>>;

        const maxRows = getLimit('CSV_IMPORT_MAX_ROWS');
        if (records.length > maxRows) {
            return NextResponse.json(
                { error: `Free tier limit: maximum ${maxRows} rows per import. Your file has ${records.length} rows.` },
                { status: 400 }
            );
        }

        if (entity !== 'students') {
            return NextResponse.json(
                { error: 'Import not supported for this entity. Valid: students' },
                { status: 400 }
            );
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        await runWithTenantContext(tenantId, async () => {
            for (const row of records) {
                try {
                    if (!row.first_name || !row.last_name) {
                        skipped++;
                        errors.push('Row skipped: missing name');
                        continue;
                    }

                    await sql`
                        INSERT INTO students (
                            tenant_id, first_name, last_name, gender,
                            date_of_birth, category, religion,
                            admission_number, status
                        ) VALUES (
                            ${tenantId},
                            ${row.first_name},
                            ${row.last_name},
                            ${row.gender || 'OTHER'},
                            ${row.date_of_birth || null},
                            ${row.category || null},
                            ${row.religion || null},
                            ${row.admission_number || null},
                            'ACTIVE'
                        )
                    `.execute();
                    imported++;
                } catch {
                    skipped++;
                    errors.push(`Row "${row.first_name} ${row.last_name}": invalid or duplicate student record`);
                }
            }
        });

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            total: records.length,
            errors: errors.slice(0, 10),
        });
    } catch (error: unknown) {
        logger.error('csv_api.import_failed', 'CSV import failed', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
    const header = columns.map(col => sanitizeCsvValue(col)).join(',');
    const body = rows
        .map(row => columns.map(col => sanitizeCsvValue(row[col])).join(','))
        .join('\n');

    return `${header}\n${body}`;
}
