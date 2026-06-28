'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function runReportQuery(dataSource: string): Promise<{ success: boolean; data?: any[]; error?: string; columns?: string[] }> {
    try {
        const { tenantId } = await requireAuth();

        let query = '';
        const params: any[] = [tenantId];

        switch (dataSource) {
            case 'Students':
                query = `
                    SELECT 
                        admission_number as "Admission No", 
                        first_name as "First Name", 
                        last_name as "Last Name", 
                        gender as "Gender", 
                        status as "Status"
                    FROM students
                    WHERE tenant_id = $1
                    ORDER BY first_name ASC
                    LIMIT 500
                `;
                break;
            case 'Fees':
                query = `
                    SELECT 
                        invoice_number as "Invoice No",
                        total_amount as "Total Amount",
                        status as "Status",
                        due_date as "Due Date"
                    FROM invoices
                    WHERE tenant_id = $1
                    ORDER BY created_at DESC
                    LIMIT 500
                `;
                break;
            case 'Attendance':
                query = `
                    SELECT 
                        a.date as "Date",
                        a.status as "Status",
                        s.first_name as "First Name",
                        s.last_name as "Last Name",
                        s.admission_number as "Admission No"
                    FROM attendance_records a
                    LEFT JOIN students s ON a.student_id = s.id
                    WHERE a.tenant_id = $1
                    ORDER BY a.date DESC
                    LIMIT 500
                `;
                break;
            default:
                return { success: false, error: 'Invalid data source selected' };
        }

        const result = await pool.query(query, params);
        
        // Extract column names from the first row or result.fields if we want
        const columns = result.fields ? result.fields.map(f => f.name) : [];
        
        return { success: true, data: result.rows, columns };
    } catch (error: any) {
        console.error('Report Generation Error:', error);
        return { success: false, error: error.message || 'An error occurred while generating the report' };
    }
}
