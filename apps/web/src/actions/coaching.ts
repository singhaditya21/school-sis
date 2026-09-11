"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { UserRole } from "@/lib/rbac/permissions";
import { logger } from "@/lib/observability/logger";

const COACHING_ADMIN_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
  UserRole.PRINCIPAL,
  UserRole.REGISTRAR,
] as const;

const createBatchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Batch name must be at least 3 characters long.")
    .max(255),
  examTarget: z.enum([
    "JEE",
    "NEET",
    "UPSC",
    "CAT",
    "CLAT",
    "GMAT",
    "GRE",
    "OTHER",
  ]),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be valid."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be valid."),
});

const scheduleTestSchema = z.object({
  batchId: z.string().uuid("Select a valid batch."),
  testName: z
    .string()
    .trim()
    .min(3, "Test name must be at least 3 characters long.")
    .max(255),
  totalMarks: z.coerce.number().int().min(1).max(10_000),
  scheduledAt: z.string().datetime({ offset: true }),
});

export type CreateCoachingBatchResult = {
  success: boolean;
  error?: string;
  data?: { id: string; name: string };
};

export async function createCoachingBatch(
  formData: FormData,
): Promise<CreateCoachingBatchResult> {
  const { tenantId, userId } = await requireRole(...COACHING_ADMIN_ROLES);
  const parsed = createBatchSchema.safeParse({
    name: formData.get("name"),
    examTarget: formData.get("examTarget"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid batch details.",
    };
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    return {
      success: false,
      error: "End date must be on or after the start date.",
    };
  }

  try {
    const rows = await sql<{ id: string; name: string }>`
      INSERT INTO coaching_batches (tenant_id, name, target_exam, start_date, end_date)
      VALUES (
        ${tenantId},
        ${parsed.data.name},
        ${parsed.data.examTarget},
        ${parsed.data.startDate},
        ${parsed.data.endDate}
      )
      RETURNING id, name
    `;

    revalidatePath("/coaching");
    revalidatePath("/coaching/tests");
    return { success: true, data: rows[0] };
  } catch (error) {
    logger.error(
      "coaching.batch_create_failed",
      "Failed to create coaching batch",
      {
        tenantId,
        actorUserId: userId,
        source: "coaching",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    return {
      success: false,
      error: "The batch could not be created. Please try again.",
    };
  }
}

export async function scheduleCoachingTest(
  formData: FormData,
): Promise<CreateCoachingBatchResult> {
  const { tenantId, userId } = await requireRole(...COACHING_ADMIN_ROLES);
  const scheduledValue = String(formData.get("scheduledAt") || "");
  const scheduledDate = new Date(scheduledValue);
  const parsed = scheduleTestSchema.safeParse({
    batchId: formData.get("batchId"),
    testName: formData.get("testName"),
    totalMarks: formData.get("totalMarks"),
    scheduledAt:
      scheduledValue && !Number.isNaN(scheduledDate.getTime())
        ? scheduledDate.toISOString()
        : "",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid test details.",
    };
  }

  try {
    const rows = await sql<{ id: string; name: string }>`
      INSERT INTO test_series (tenant_id, batch_id, test_name, total_marks, scheduled_at)
      SELECT
        ${tenantId},
        cb.id,
        ${parsed.data.testName},
        ${parsed.data.totalMarks},
        ${parsed.data.scheduledAt}
      FROM coaching_batches cb
      WHERE cb.id = ${parsed.data.batchId}
        AND cb.tenant_id = ${tenantId}
        AND cb.is_active = true
      RETURNING id, test_name AS name
    `;
    if (!rows[0])
      return { success: false, error: "The selected batch is unavailable." };

    revalidatePath("/coaching");
    revalidatePath("/coaching/tests");
    return { success: true, data: rows[0] };
  } catch (error) {
    logger.error(
      "coaching.test_schedule_failed",
      "Failed to schedule coaching test",
      {
        tenantId,
        actorUserId: userId,
        source: "coaching",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    return {
      success: false,
      error: "The test could not be scheduled. Please try again.",
    };
  }
}
