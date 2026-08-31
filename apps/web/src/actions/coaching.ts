'use server';

import { sql, identifier } from '@school-sis/api/src/data';
import { coachingBatches } from '@school-sis/api/src/db/generated/tables';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

/**
 * The migrated `coaching_batches` table is intentionally minimal:
 *   (id, tenant_id, name, target_exam, start_date, end_date, is_active, created_at)
 * so this action only accepts/stores those fields. The old form also collected
 * `courseId`, `capacity`, and `facultyId`, but there are no columns for them (and no
 * related table), so they are not persisted — adding them back would require a schema
 * migration first. `end_date` is NOT NULL; the form does not yet collect it, so it
 * defaults to one year after the start date when omitted.
 */
const createBatchSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(3, "Batch name must be at least 3 characters long"),
  examTarget: z.enum(['JEE', 'NEET', 'UPSC', 'CAT', 'CLAT', 'GMAT', 'GRE', 'OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").optional().nullable(),
});

/** One year after a YYYY-MM-DD date, as YYYY-MM-DD. */
function oneYearAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export async function createCoachingBatch(formData: FormData) {
  try {
    const rawData = {
      tenantId: formData.get('tenantId')?.toString(),
      name: formData.get('name')?.toString(),
      examTarget: formData.get('examTarget')?.toString(),
      startDate: formData.get('startDate')?.toString(),
      endDate: formData.get('endDate')?.toString() || null,
    };

    const validatedData = createBatchSchema.parse(rawData);
    const endDate = validatedData.endDate ?? oneYearAfter(validatedData.startDate);

    // tenant_id is set explicitly (and validated as a UUID); the routing pool's RLS
    // still enforces that it matches the request's signed tenant context. is_active
    // defaults to true in the schema, so a new batch is active on creation.
    const [newBatch] = await sql`
      INSERT INTO ${identifier(coachingBatches.$name)}
        (tenant_id, name, target_exam, start_date, end_date)
      VALUES (${validatedData.tenantId}, ${validatedData.name}, ${validatedData.examTarget}, ${validatedData.startDate}, ${endDate})
      RETURNING *
    `;

    revalidatePath('/coaching');

    return { success: true, data: newBatch };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.flatten().fieldErrors };
    }
    console.error("Coaching Batch Error:", error);
    return { success: false, message: 'Failed to create coaching batch.' };
  }
}
