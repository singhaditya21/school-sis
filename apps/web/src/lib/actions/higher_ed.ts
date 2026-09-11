"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { UserRole } from "@/lib/rbac/permissions";
import { logger } from "@/lib/observability/logger";

const HIGHER_ED_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.GROUP_EXECUTIVE,
  UserRole.SCHOOL_ADMIN,
  UserRole.PRINCIPAL,
  UserRole.REGISTRAR,
] as const;

const programSchema = z.object({
  name: z.string().trim().min(3).max(255),
  degreeType: z.enum(["BACHELOR", "MASTER", "PHD", "DIPLOMA"]),
  durationYears: z.coerce.number().int().min(1).max(12),
  totalCredits: z.coerce.number().int().min(1).max(1_000),
});

const courseSchema = z.object({
  programId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((value) => value.toUpperCase()),
  title: z.string().trim().min(3).max(255),
  credits: z.coerce.number().int().min(1).max(50),
});

export type HigherEducationActionResult = {
  success: boolean;
  error?: string;
  data?: { id: string; name: string };
};

export type UniversityProgram = {
  id: string;
  name: string;
  degreeType: "BACHELOR" | "MASTER" | "PHD" | "DIPLOMA";
  durationYears: number;
  totalCredits: number;
  createdAt: string | Date;
};

export async function getUniversityProgramsAction(): Promise<
  UniversityProgram[]
> {
  const { tenantId } = await requireRole(...HIGHER_ED_ROLES);
  const rows = await sql<UniversityProgram>`
    SELECT id, name, degree_type AS "degreeType", duration_years AS "durationYears",
                total_credits AS "totalCredits", created_at AS "createdAt"
    FROM university_programs
    WHERE tenant_id = ${tenantId}
    ORDER BY name
  `;
  return rows;
}

export async function getUniversityCoursesAction() {
  const { tenantId } = await requireRole(...HIGHER_ED_ROLES);
  const rows = await sql`
    SELECT uc.id, uc.code, uc.title, uc.credits, up.name AS "programName",
                up.degree_type AS "degreeType"
    FROM university_courses uc
    JOIN university_programs up
      ON up.id = uc.program_id
     AND up.tenant_id = uc.tenant_id
    WHERE uc.tenant_id = ${tenantId}
    ORDER BY uc.code
  `;
  return rows;
}

export async function getUniversityDashboardSummaryAction() {
  const { tenantId } = await requireRole(...HIGHER_ED_ROLES);
  const rows = await sql<{
    totalPrograms: number;
    totalCourses: number;
    facultyAllocations: number;
    assignedHours: number;
  }>`
    SELECT
      (SELECT COUNT(*)::int FROM university_programs WHERE tenant_id = ${tenantId}) AS "totalPrograms",
      (SELECT COUNT(*)::int FROM university_courses WHERE tenant_id = ${tenantId}) AS "totalCourses",
      (SELECT COUNT(*)::int FROM faculty_workload WHERE tenant_id = ${tenantId}) AS "facultyAllocations",
      (SELECT COALESCE(SUM(assigned_hours), 0)::int FROM faculty_workload WHERE tenant_id = ${tenantId}) AS "assignedHours"
  `;
  return (
    rows[0] || {
      totalPrograms: 0,
      totalCourses: 0,
      facultyAllocations: 0,
      assignedHours: 0,
    }
  );
}

export async function createUniversityProgramAction(
  formData: FormData,
): Promise<HigherEducationActionResult> {
  const { tenantId, userId } = await requireRole(...HIGHER_ED_ROLES);
  const parsed = programSchema.safeParse({
    name: formData.get("name"),
    degreeType: formData.get("degreeType"),
    durationYears: formData.get("durationYears"),
    totalCredits: formData.get("totalCredits"),
  });
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid program details.",
    };

  try {
    const duplicate = await sql`
      SELECT 1 FROM university_programs
      WHERE tenant_id = ${tenantId}
        AND lower(name) = lower(${parsed.data.name})
      LIMIT 1
    `;
    if (duplicate.length)
      return {
        success: false,
        error: "A program with this name already exists.",
      };

    const rows = await sql<{ id: string; name: string }>`
      INSERT INTO university_programs (tenant_id, name, degree_type, duration_years, total_credits)
      VALUES (
        ${tenantId},
        ${parsed.data.name},
        ${parsed.data.degreeType},
        ${parsed.data.durationYears},
        ${parsed.data.totalCredits}
      )
      RETURNING id, name
    `;
    revalidatePath("/university");
    revalidatePath("/university/courses");
    return { success: true, data: rows[0] };
  } catch (error) {
    logger.error(
      "higher_ed.program_create_failed",
      "Failed to create higher-education program",
      {
        tenantId,
        actorUserId: userId,
        source: "higher_ed",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    return {
      success: false,
      error: "The program could not be created. Please try again.",
    };
  }
}

export async function createUniversityCourseAction(
  formData: FormData,
): Promise<HigherEducationActionResult> {
  const { tenantId, userId } = await requireRole(...HIGHER_ED_ROLES);
  const parsed = courseSchema.safeParse({
    programId: formData.get("programId"),
    code: formData.get("code"),
    title: formData.get("title"),
    credits: formData.get("credits"),
  });
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid course details.",
    };

  try {
    const duplicate = await sql`
      SELECT 1 FROM university_courses
      WHERE tenant_id = ${tenantId}
        AND lower(code) = lower(${parsed.data.code})
      LIMIT 1
    `;
    if (duplicate.length)
      return {
        success: false,
        error: "A course with this code already exists.",
      };

    const rows = await sql<{ id: string; name: string }>`
      INSERT INTO university_courses (tenant_id, program_id, code, title, credits)
      SELECT
        ${tenantId},
        up.id,
        ${parsed.data.code},
        ${parsed.data.title},
        ${parsed.data.credits}
      FROM university_programs up
      WHERE up.id = ${parsed.data.programId}
        AND up.tenant_id = ${tenantId}
      RETURNING id, title AS name
    `;
    if (!rows[0])
      return { success: false, error: "The selected program is unavailable." };

    revalidatePath("/university");
    revalidatePath("/university/courses");
    return { success: true, data: rows[0] };
  } catch (error) {
    logger.error(
      "higher_ed.course_create_failed",
      "Failed to create higher-education course",
      {
        tenantId,
        actorUserId: userId,
        source: "higher_ed",
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    );
    return {
      success: false,
      error: "The course could not be created. Please try again.",
    };
  }
}
