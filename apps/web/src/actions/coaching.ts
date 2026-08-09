'use server';

import { db } from '@/lib/db';
import { coachingBatches } from '@/lib/db/schema/coaching';
import { requireCapability } from '@/lib/capabilities/server';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const createBatchSchema = z.object({
  name: z.string().trim().min(3, 'Batch name must be at least 3 characters long').max(255),
  examTarget: z.enum(['JEE', 'NEET', 'UPSC', 'CAT', 'CLAT', 'GMAT', 'GRE', 'OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
});

export async function createCoachingBatch(formData: FormData) {
  // Tenant and actor identity are authoritative only when derived from the
  // authenticated server session. Client-provided identity fields are ignored.
  const { tenantId, userId } = await requireCapability('coaching', 'academic:write');

  try {
    const rawData = {
      name: formData.get('name')?.toString(),
      examTarget: formData.get('examTarget')?.toString(),
      startDate: formData.get('startDate')?.toString(),
      endDate: formData.get('endDate')?.toString(),
    };

    const validatedData = createBatchSchema.parse(rawData);

    const [newBatch] = await db.insert(coachingBatches).values({
      tenantId,
      name: validatedData.name,
      targetExam: validatedData.examTarget,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      isActive: true,
    }).returning();

    if (!newBatch) {
      throw new Error('The database did not return the created coaching batch.');
    }

    await logAudit({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'coaching_batch',
      entityId: newBatch.id,
      description: `Created coaching batch "${newBatch.name}".`,
      afterState: {
        name: newBatch.name,
        targetExam: newBatch.targetExam,
        startDate: newBatch.startDate,
        endDate: newBatch.endDate,
        isActive: newBatch.isActive,
      },
    });

    revalidatePath('/coaching');

    return { success: true, data: newBatch };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: 'Please correct the invalid batch details.',
        errors: error.flatten().fieldErrors,
      };
    }
    console.error('Coaching Batch Error:', error);
    return { success: false, message: 'Failed to create coaching batch.' };
  }
}
