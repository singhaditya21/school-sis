"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { encryptDeterministic, decryptFieldTolerant } from "@/lib/encryption";
import { UserRole } from "@/lib/rbac/permissions";

const INTERNATIONAL_ROLES = [
  UserRole.PLATFORM_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.GROUP_EXECUTIVE,
  UserRole.SCHOOL_ADMIN,
  UserRole.PRINCIPAL,
  UserRole.REGISTRAR,
  UserRole.STUDENT_SUCCESS_COUNSELOR,
] as const;

const UUID = z.string().uuid();
const visaSchema = z.object({
  studentId: UUID,
  visaType: z.string().trim().min(2).max(50),
  countryOfOrigin: z.string().trim().min(2).max(100),
  passportNumber: z
    .string()
    .trim()
    .min(4)
    .max(100)
    .transform((value) => value.toUpperCase()),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const hostFamilySchema = z.object({
  familyName: z.string().trim().min(2).max(255),
  address: z.string().trim().min(5).max(500),
  phone: z.string().trim().min(7).max(30),
  backgroundChecked: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const placementSchema = z.object({
  studentId: UUID,
  hostFamilyId: UUID.optional(),
  placementYear: z.string().regex(/^\d{4}$/),
});

function maskPassport(value: string): string {
  const visible = value.slice(-4);
  return `${"•".repeat(Math.max(4, value.length - visible.length))}${visible}`;
}

export async function getInternationalSetupOptionsAction() {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const [students, families] = await Promise.all([
    sql<{ id: string; name: string }>`
      SELECT id, first_name || ' ' || last_name AS name
      FROM students
      WHERE tenant_id = ${tenantId}
      ORDER BY first_name, last_name
    `,
    sql<{ id: string; name: string }>`
      SELECT id, family_name AS name
      FROM host_families
      WHERE tenant_id = ${tenantId}
      ORDER BY family_name
    `,
  ]);
  return { students, families };
}

export async function getStudentVisasAction() {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const rows = await sql`
    SELECT sv.id, sv.visa_type AS "visaType", sv.country_of_origin AS "countryOfOrigin",
                COALESCE(sv.passport_number_enc, sv.passport_number) AS "passportNumber",
                sv.issue_date AS "issueDate", sv.expiration_date AS "expirationDate",
                s.first_name || ' ' || s.last_name AS "studentName"
    FROM student_visas sv
    JOIN students s ON s.id = sv.student_id AND s.tenant_id = sv.tenant_id
    WHERE sv.tenant_id = ${tenantId}
    ORDER BY sv.expiration_date ASC
  `;
  return rows.map((row) => {
    const passport =
      row.passportNumber == null
        ? ""
        : decryptFieldTolerant(row.passportNumber);
    return {
      ...row,
      passportNumber: passport ? maskPassport(passport) : "Unavailable",
    };
  });
}

export async function createStudentVisaAction(data: {
  studentId: string;
  visaType: string;
  countryOfOrigin: string;
  passportNumber: string;
  issueDate: string;
  expirationDate: string;
}) {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const parsed = visaSchema.safeParse(data);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid visa details.",
    };
  if (parsed.data.expirationDate < parsed.data.issueDate) {
    return {
      success: false,
      error: "Visa expiry must be on or after its issue date.",
    };
  }

  const encryptedPassport = encryptDeterministic(
    parsed.data.passportNumber,
    "student-visas.passport-number",
  );
  const rows = await sql`
    INSERT INTO student_visas (
      tenant_id, student_id, visa_type, country_of_origin, passport_number_enc, issue_date, expiration_date
    )
    SELECT
      ${tenantId},
      s.id,
      ${parsed.data.visaType},
      ${parsed.data.countryOfOrigin},
      ${encryptedPassport},
      ${parsed.data.issueDate},
      ${parsed.data.expirationDate}
    FROM students s
    WHERE s.id = ${parsed.data.studentId}
      AND s.tenant_id = ${tenantId}
    RETURNING id
  `;
  if (!rows[0])
    return { success: false, error: "The selected student is unavailable." };

  revalidatePath("/international");
  return { success: true };
}

export async function getHostFamiliesAction() {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const rows = await sql`
    SELECT id, family_name AS "familyName", address,
                COALESCE(phone_enc, phone) AS phone,
                background_checked AS "backgroundChecked"
    FROM host_families
    WHERE tenant_id = ${tenantId}
    ORDER BY family_name ASC
  `;
  return rows.map((row) => ({
    ...row,
    phone: row.phone == null ? null : decryptFieldTolerant(row.phone),
  }));
}

export async function createHostFamilyAction(data: {
  familyName: string;
  address: string;
  phone: string;
  backgroundChecked?: string;
}) {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const parsed = hostFamilySchema.safeParse(data);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid host-family details.",
    };

  const encryptedPhone = encryptDeterministic(
    parsed.data.phone,
    "host-families.phone",
  );
  await sql`
    INSERT INTO host_families (tenant_id, family_name, address, phone_enc, background_checked)
    VALUES (
      ${tenantId},
      ${parsed.data.familyName},
      ${parsed.data.address},
      ${encryptedPhone},
      ${parsed.data.backgroundChecked || null}
    )
  `;
  revalidatePath("/international");
  return { success: true };
}

export async function getInternationalPlacementsAction() {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const rows = await sql`
    SELECT ip.id, ip.placement_year AS "placementYear",
                s.first_name || ' ' || s.last_name AS "studentName",
                hf.family_name AS "hostFamilyName"
    FROM international_placements ip
    JOIN students s ON s.id = ip.student_id AND s.tenant_id = ip.tenant_id
    LEFT JOIN host_families hf ON hf.id = ip.host_family_id AND hf.tenant_id = ip.tenant_id
    WHERE ip.tenant_id = ${tenantId}
    ORDER BY ip.placement_year DESC
  `;
  return rows;
}

export async function createInternationalPlacementAction(data: {
  studentId: string;
  hostFamilyId?: string;
  placementYear: string;
}) {
  const { tenantId } = await requireRole(...INTERNATIONAL_ROLES);
  const parsed = placementSchema.safeParse({
    ...data,
    hostFamilyId: data.hostFamilyId || undefined,
  });
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid placement details.",
    };

  const hostFamilyId = parsed.data.hostFamilyId || null;
  const rows = await sql`
    INSERT INTO international_placements (tenant_id, student_id, host_family_id, placement_year)
    SELECT ${tenantId}, s.id, hf.id, ${parsed.data.placementYear}
    FROM students s
    LEFT JOIN host_families hf
      ON hf.id = ${hostFamilyId}::uuid
     AND hf.tenant_id = ${tenantId}
    WHERE s.id = ${parsed.data.studentId}
      AND s.tenant_id = ${tenantId}
      AND (${hostFamilyId}::uuid IS NULL OR hf.id IS NOT NULL)
    RETURNING id
  `;
  if (!rows[0])
    return {
      success: false,
      error: "The selected student or host family is unavailable.",
    };

  revalidatePath("/international");
  return { success: true };
}
