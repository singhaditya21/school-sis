import { NextRequest, NextResponse } from 'next/server';
import { pool, } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { parse } from 'csv-parse/sync';
import { getLimit } from '@/lib/config/limits';

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

    try {
        let csvContent: string;

        switch (entity) {
            case 'students': {
                const result = await pool.query(`
                    SELECT
                        s.admission_number, s.first_name, s.last_name, s.gender,
                        s.date_of_birth, s.category, s.religion,
                        s.aadhaar_number, s.apaar_id,
                        s.address, s.city, s.state, s.pincode,
                        g.name AS grade, sec.name AS section, s.status
                    FROM students s
                    LEFT JOIN sections sec ON sec.id = s.section_id
                    LEFT JOIN grades g ON g.id = sec.grade_id
                    WHERE s.tenant_id = $1
                    ORDER BY g.display_order, sec.name, s.first_name
                `, [tenantId]);

                csvContent = toCSV(result.rows, [
                    'admission_number', 'first_name', 'last_name', 'gender',
                    'date_of_birth', 'category', 'religion',
                    'aadhaar_number', 'apaar_id',
                    'address', 'city', 'state', 'pincode',
                    'grade', 'section', 'status',
                ]);
                break;
            }

            case 'fees': {
                const result = await pool.query(`
                    SELECT
                        i.invoice_number, s.admission_number,
                        s.first_name || ' ' || s.last_name AS student_name,
                        g.name AS grade,
                        i.total_amount, i.paid_amount,
                        i.total_amount - i.paid_amount AS balance,
                        i.due_date, i.status
                    FROM invoices i
                    JOIN students s ON s.id = i.student_id
                    LEFT JOIN sections sec ON sec.id = s.section_id
                    LEFT JOIN grades g ON g.id = sec.grade_id
                    WHERE i.tenant_id = $1
                    ORDER BY i.due_date DESC
                `, [tenantId]);

                csvContent = toCSV(result.rows, [
                    'invoice_number', 'admission_number', 'student_name', 'grade',
                    'total_amount', 'paid_amount', 'balance', 'due_date', 'status',
                ]);
                break;
            }

            case 'attendance': {
                const result = await pool.query(`
                    SELECT
                        s.admission_number,
                        s.first_name || ' ' || s.last_name AS student_name,
                        g.name AS grade,
                        ar.date, ar.status, ar.remarks
                    FROM attendance_records ar
                    JOIN students s ON s.id = ar.student_id
                    LEFT JOIN sections sec ON sec.id = s.section_id
                    LEFT JOIN grades g ON g.id = sec.grade_id
                    WHERE ar.tenant_id = $1
                    ORDER BY ar.date DESC, g.display_order, s.first_name
                    LIMIT $2
                `, [tenantId, getLimit('CSV_EXPORT_MAX_ROWS')]);

                csvContent = toCSV(result.rows, [
                    'admission_number', 'student_name', 'grade', 'date', 'status', 'remarks',
                ]);
                break;
            }

            default:
                return NextResponse.json(
                    { error: 'Invalid entity. Valid: students, fees, attendance' },
                    { status: 400 }
                );
        }

        return new NextResponse(csvContent, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${entity}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: any) {
        console.error('[CSV Export] Error:', error.message);
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

        // Validate file type
        if (!file.name.endsWith('.csv')) {
            return NextResponse.json({ error: 'Only CSV files are supported' }, { status: 400 });
        }

        // Size limit: 5MB
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 400 });
        }

        const text = await file.text();
        const records = parse(text, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }) as Array<Record<string, string>>;

        // FREE TIER: Cap import rows
        const maxRows = getLimit('CSV_IMPORT_MAX_ROWS');
        if (records.length > maxRows) {
            return NextResponse.json(
                { error: `Free tier limit: maximum ${maxRows} rows per import. Your file has ${records.length} rows.` },
                { status: 400 }
            );
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        switch (entity) {
            case 'students': {
                for (const row of records) {
                    try {
                        if (!row.first_name || !row.last_name) {
                            skipped++;
                            errors.push(`Row skipped: missing name`);
                            continue;
                        }

                        await pool.query(`
                            INSERT INTO students (
                                tenant_id, first_name, last_name, gender,
                                date_of_birth, category, religion,
                                admission_number, status
                            ) VALUES (
                                $1, $2, $3,
                                $4,
                                $5, $6,
                                $7,
                                $8, 'ACTIVE'
                            )
                        `, [
                            tenantId, row.first_name, row.last_name,
                            row.gender || 'OTHER',
                            row.date_of_birth || null, row.category || null,
                            row.religion || null,
                            row.admission_number || null
                        ]);
                        imported++;
                    } catch (e: any) {
                        skipped++;
                        errors.push(`Row "${row.first_name} ${row.last_name}": ${e.message}`);
                    }
                }
                break;
            }

            default:
                return NextResponse.json(
                    { error: 'Import not supported for this entity. Valid: students' },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            total: records.length,
            errors: errors.slice(0, 10), // Show first 10 errors
        });
    } catch (error: any) {
        console.error('[CSV Import] Error:', error.message);
        return NextResponse.json({ error: 'Import failed: ' + error.message }, { status: 500 });
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function toCSV(rows: Record<string, any>[], columns: string[]): string {
    const header = columns.join(',');
    const body = rows.map(row =>
        columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        }).join(',')
    ).join('\n');

    return `${header}\n${body}`;
}
