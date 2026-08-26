'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export type HostelFeeActionResult = {
    success: boolean;
    error?: string;
    paidDate?: string;
};

/**
 * Mark a hostel/mess/caution fee as settled.
 *
 * `hostel_fees` carries only `status` and `paid_date`, so that is exactly what
 * this records — it does not raise a receipt or post to the main fee ledger,
 * neither of which is wired to this table.
 */
export async function markHostelFeePaid(feeId: string): Promise<HostelFeeActionResult> {
    const { tenantId } = await requireAuth('hostel:write');

    if (!feeId) return { success: false, error: 'Fee record not found.' };

    const { rows } = await pool.query(
        `UPDATE hostel_fees
         SET status = 'paid', paid_date = CURRENT_DATE
         WHERE id = $1 AND tenant_id = $2 AND status <> 'paid'
         RETURNING paid_date AS "paidDate"`,
        [feeId, tenantId],
    );

    if (rows.length === 0) {
        return { success: false, error: 'That fee record is missing, or is already marked paid.' };
    }

    revalidatePath('/hostel/fees');

    const paidDate = rows[0].paidDate as Date | string;
    return {
        success: true,
        paidDate: paidDate instanceof Date ? paidDate.toISOString().slice(0, 10) : String(paidDate).slice(0, 10),
    };
}
