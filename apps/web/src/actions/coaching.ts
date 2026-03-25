'use server';

import { db } from '@/lib/db';
import { coachingBatches } from '@/lib/db/schema/coaching';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const createBatchSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(3, "Batch name must be at least 3 characters long"),
  examTarget: z.enum(['JEE', 'NEET', 'UPSC', 'CAT', 'CLAT', 'GMAT', 'GRE', 'OTHER']),
  courseId: z.string().uuid().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format").optional().nullable(),
  capacity: z.number().int().min(1).max(500),
  facultyId: z.string().uuid().optional().nullable(),
});

export async function createCoachingBatch(formData: FormData) {
  try {
    const rawData = {
      tenantId: formData.get('tenantId')?.toString(),
      name: formData.get('name')?.toString(),
      examTarget: formData.get('examTarget')?.toString(),
      courseId: formData.get('courseId')?.toString() || null,
      startDate: formData.get('startDate')?.toString(),
      endDate: formData.get('endDate')?.toString() || null,
      capacity: parseInt(formData.get('capacity')?.toString() || '0', 10),
      facultyId: formData.get('facultyId')?.toString() || null,
    };

    const validatedData = createBatchSchema.parse(rawData);

    // Drizzle Insert statement
    const [newBatch] = await db.insert(coachingBatches).values({
      tenantId: validatedData.tenantId,
      name: validatedData.name,
      examTarget: validatedData.examTarget as any,
      courseId: validatedData.courseId,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      capacity: validatedData.capacity,
      primaryFacultyId: validatedData.facultyId,
      status: 'ACTIVE',
    }).returning();

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
