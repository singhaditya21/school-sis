'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { isInstitutionType, type InstitutionType } from './constants';

/**
 * School profile server actions.
 *
 * These live beside the route because the only tenant-level configuration this
 * release actually persists is the `tenants` row itself — there is no
 * `tenant_settings` table in the schema. Every field below maps 1:1 onto a real
 * column in `public.tenants` (see apps/web/drizzle/0000_init_baseline.sql).
 */

export type SchoolProfile = {
    id: string;
    name: string;
    /** Immutable tenant key used for login and routing. */
    code: string;
    /** Host-based tenant resolution. Managed by the platform team. */
    domain: string | null;
    institutionType: InstitutionType;
    logoUrl: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    affiliationBoard: string | null;
    affiliationNumber: string | null;
    udiseCode: string | null;
    updatedAt: string | null;
};

export type SchoolProfileInput = {
    name: string;
    institutionType: string;
    logoUrl: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    website: string;
    affiliationBoard: string;
    affiliationNumber: string;
    udiseCode: string;
};

export type SaveSchoolProfileResult = {
    success: boolean;
    error?: string;
    /** Field key that failed validation, so the form can focus it. */
    field?: keyof SchoolProfileInput;
};

const SCHOOL_PROFILE_COLUMNS = `
    id,
    name,
    code,
    domain,
    institution_type AS "institutionType",
    logo_url AS "logoUrl",
    address,
    city,
    state,
    pincode,
    phone,
    email,
    website,
    affiliation_board AS "affiliationBoard",
    affiliation_number AS "affiliationNumber",
    udise_code AS "udiseCode",
    updated_at AS "updatedAt"
`;

export async function getSchoolProfile(): Promise<SchoolProfile | null> {
    const { tenantId } = await requireAuth('settings:read');

    const { rows } = await pool.query(
        `SELECT ${SCHOOL_PROFILE_COLUMNS} FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantId],
    );

    return (rows[0] as SchoolProfile | undefined) ?? null;
}

function trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** Empty string means "clear this column", so nullable columns store NULL. */
function orNull(value: string): string | null {
    return value.length > 0 ? value : null;
}

type FieldRule = {
    key: keyof SchoolProfileInput;
    label: string;
    /** varchar length in the database; text columns pass `null`. */
    maxLength: number | null;
};

const LENGTH_RULES: FieldRule[] = [
    { key: 'name', label: 'School name', maxLength: 255 },
    { key: 'logoUrl', label: 'Logo URL', maxLength: null },
    { key: 'address', label: 'Address', maxLength: null },
    { key: 'city', label: 'City', maxLength: 100 },
    { key: 'state', label: 'State', maxLength: 100 },
    { key: 'pincode', label: 'PIN code', maxLength: 10 },
    { key: 'phone', label: 'Phone', maxLength: 20 },
    { key: 'email', label: 'Email', maxLength: 255 },
    { key: 'website', label: 'Website', maxLength: 255 },
    { key: 'affiliationBoard', label: 'Affiliation board', maxLength: 50 },
    { key: 'affiliationNumber', label: 'Affiliation number', maxLength: 100 },
    { key: 'udiseCode', label: 'UDISE code', maxLength: 20 },
];

export async function updateSchoolProfileAction(
    input: SchoolProfileInput,
): Promise<SaveSchoolProfileResult> {
    const { tenantId } = await requireAuth('settings:write');

    const values: Record<keyof SchoolProfileInput, string> = {
        name: trimmed(input?.name),
        institutionType: trimmed(input?.institutionType),
        logoUrl: trimmed(input?.logoUrl),
        address: trimmed(input?.address),
        city: trimmed(input?.city),
        state: trimmed(input?.state),
        pincode: trimmed(input?.pincode),
        phone: trimmed(input?.phone),
        email: trimmed(input?.email),
        website: trimmed(input?.website),
        affiliationBoard: trimmed(input?.affiliationBoard),
        affiliationNumber: trimmed(input?.affiliationNumber),
        udiseCode: trimmed(input?.udiseCode),
    };

    if (values.name.length === 0) {
        return { success: false, error: 'School name is required.', field: 'name' };
    }

    if (!isInstitutionType(values.institutionType)) {
        return {
            success: false,
            error: 'Choose a valid institution type.',
            field: 'institutionType',
        };
    }

    for (const rule of LENGTH_RULES) {
        if (rule.maxLength !== null && values[rule.key].length > rule.maxLength) {
            return {
                success: false,
                error: `${rule.label} must be ${rule.maxLength} characters or fewer.`,
                field: rule.key,
            };
        }
    }

    if (values.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        return { success: false, error: 'Enter a valid email address.', field: 'email' };
    }

    if (values.website.length > 0 && !/^https?:\/\/\S+$/i.test(values.website)) {
        return {
            success: false,
            error: 'Website must start with http:// or https://',
            field: 'website',
        };
    }

    if (values.logoUrl.length > 0 && !/^https?:\/\/\S+$/i.test(values.logoUrl)) {
        return {
            success: false,
            error: 'Logo URL must start with http:// or https://',
            field: 'logoUrl',
        };
    }

    const { rowCount } = await pool.query(
        `UPDATE tenants
            SET name = $2,
                institution_type = $3::institution_type,
                logo_url = $4,
                address = $5,
                city = $6,
                state = $7,
                pincode = $8,
                phone = $9,
                email = $10,
                website = $11,
                affiliation_board = $12,
                affiliation_number = $13,
                udise_code = $14,
                updated_at = now()
          WHERE id = $1`,
        [
            tenantId,
            values.name,
            values.institutionType,
            orNull(values.logoUrl),
            orNull(values.address),
            orNull(values.city),
            orNull(values.state),
            orNull(values.pincode),
            orNull(values.phone),
            orNull(values.email),
            orNull(values.website),
            orNull(values.affiliationBoard),
            orNull(values.affiliationNumber),
            orNull(values.udiseCode),
        ],
    );

    if (!rowCount) {
        return { success: false, error: 'School record not found for this tenant.' };
    }

    revalidatePath('/settings/school');
    return { success: true };
}
