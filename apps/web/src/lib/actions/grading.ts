'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { tenantScope, asc, desc, eq } from '@school-sis/api/src/data';
import { gradingScales, gradingRubrics } from '@school-sis/api/src/db/generated/tables';
import { requireAuth } from '@/lib/auth/middleware';

export type GradingSchemeType = 'PERCENTAGE' | 'GPA' | 'CGPA' | 'LETTER';

export interface GradeThresholdDTO {
    id: string;
    minPercentage: number;
    maxPercentage: number;
    grade: string;
    gradePoint: number | null;
    remark: string;
    displayOrder: number;
}

export interface GradingSchemeDTO {
    id: string;
    name: string;
    type: GradingSchemeType;
    description: string;
    isDefault: boolean;
    isActive: boolean;
    thresholds: GradeThresholdDTO[];
}

const DEFAULT_SCHEMES: GradingSchemeDTO[] = [
    {
        id: 'default-cbse-9pt',
        name: 'CBSE 9-Point Scale',
        type: 'GPA',
        description: 'Standard CBSE grading scheme for Classes 9-12',
        isDefault: true,
        isActive: true,
        thresholds: [
            { id: 't1', minPercentage: 91, maxPercentage: 100, grade: 'A1', gradePoint: 10.0, remark: 'Outstanding', displayOrder: 1 },
            { id: 't2', minPercentage: 81, maxPercentage: 90, grade: 'A2', gradePoint: 9.0, remark: 'Excellent', displayOrder: 2 },
            { id: 't3', minPercentage: 71, maxPercentage: 80, grade: 'B1', gradePoint: 8.0, remark: 'Very Good', displayOrder: 3 },
            { id: 't4', minPercentage: 61, maxPercentage: 70, grade: 'B2', gradePoint: 7.0, remark: 'Good', displayOrder: 4 },
            { id: 't5', minPercentage: 51, maxPercentage: 60, grade: 'C1', gradePoint: 6.0, remark: 'Above Average', displayOrder: 5 },
            { id: 't6', minPercentage: 41, maxPercentage: 50, grade: 'C2', gradePoint: 5.0, remark: 'Average', displayOrder: 6 },
            { id: 't7', minPercentage: 33, maxPercentage: 40, grade: 'D', gradePoint: 4.0, remark: 'Below Average', displayOrder: 7 },
            { id: 't8', minPercentage: 0, maxPercentage: 32, grade: 'E', gradePoint: 0.0, remark: 'Needs Improvement', displayOrder: 8 },
        ],
    },
    {
        id: 'default-icse-pct',
        name: 'ICSE Percentage',
        type: 'PERCENTAGE',
        description: 'ICSE Board percentage-based grading',
        isDefault: false,
        isActive: true,
        thresholds: [
            { id: 't9', minPercentage: 90, maxPercentage: 100, grade: 'A+', gradePoint: null, remark: 'Distinction', displayOrder: 1 },
            { id: 't10', minPercentage: 75, maxPercentage: 89, grade: 'A', gradePoint: null, remark: 'First Class', displayOrder: 2 },
            { id: 't11', minPercentage: 60, maxPercentage: 74, grade: 'B', gradePoint: null, remark: 'Second Class', displayOrder: 3 },
            { id: 't12', minPercentage: 45, maxPercentage: 59, grade: 'C', gradePoint: null, remark: 'Pass', displayOrder: 4 },
            { id: 't13', minPercentage: 0, maxPercentage: 44, grade: 'F', gradePoint: null, remark: 'Fail', displayOrder: 5 },
        ],
    },
];

function deriveRemark(minPct: number): string {
    if (minPct >= 90) return 'Outstanding';
    if (minPct >= 80) return 'Excellent';
    if (minPct >= 70) return 'Very Good';
    if (minPct >= 60) return 'Good';
    if (minPct >= 50) return 'Above Average';
    if (minPct >= 33) return 'Pass';
    return 'Needs Improvement';
}

function normalizeSchemeType(raw: string): GradingSchemeType {
    const upper = raw.trim().toUpperCase();
    if (upper === 'PERCENTAGE' || upper === 'GPA' || upper === 'CGPA' || upper === 'LETTER') {
        return upper;
    }
    return 'GPA';
}

export async function getGradingSchemes(): Promise<{
    success: boolean;
    data: GradingSchemeDTO[];
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth();
        const scope = tenantScope(tenantId);

        const scaleRows = await scope
            .from(gradingScales)
            .select<{ id: string; name: string; type: string }>({
                id: gradingScales.id,
                name: gradingScales.name,
                type: gradingScales.type,
            })
            .orderBy(asc(gradingScales.createdAt))
            .rows();

        if (scaleRows.length === 0) {
            return { success: true, data: DEFAULT_SCHEMES };
        }

        const rubricRows = await scope
            .fromChild(gradingRubrics, {
                parent: gradingScales,
                on: eq(gradingRubrics.scaleId, gradingScales.id),
            })
            .select<{
                id: string;
                scaleId: string;
                label: string;
                minScore: string | null;
                maxScore: string | null;
                gpaValue: string | null;
            }>({
                id: gradingRubrics.id,
                scaleId: gradingRubrics.scaleId,
                label: gradingRubrics.label,
                minScore: gradingRubrics.minScore,
                maxScore: gradingRubrics.maxScore,
                gpaValue: gradingRubrics.gpaValue,
            })
            .orderBy(desc(gradingRubrics.minScore))
            .rows();

        const rubricsByScale = new Map<string, GradeThresholdDTO[]>();
        for (const r of rubricRows) {
            const list = rubricsByScale.get(r.scaleId) ?? [];
            const minPct = Number(r.minScore ?? 0);
            const maxPct = Number(r.maxScore ?? 100);
            const gpaVal = r.gpaValue !== null && r.gpaValue !== undefined ? Number(r.gpaValue) : null;
            list.push({
                id: r.id,
                minPercentage: minPct,
                maxPercentage: maxPct,
                grade: r.label,
                gradePoint: gpaVal !== null && Number.isFinite(gpaVal) ? gpaVal : null,
                remark: deriveRemark(minPct),
                displayOrder: list.length + 1,
            });
            rubricsByScale.set(r.scaleId, list);
        }

        const dbSchemes: GradingSchemeDTO[] = scaleRows.map((scale, idx) => {
            const schemeType = normalizeSchemeType(scale.type);
            return {
                id: scale.id,
                name: scale.name,
                type: schemeType,
                description: `${schemeType} grading scale configured for this school`,
                isDefault: idx === 0,
                isActive: true,
                thresholds: rubricsByScale.get(scale.id) ?? [],
            };
        });

        return { success: true, data: [...dbSchemes, ...DEFAULT_SCHEMES.map(s => ({ ...s, isDefault: false }))] };
    } catch (error) {
        return {
            success: false,
            data: DEFAULT_SCHEMES,
            error: error instanceof Error ? error.message : 'Failed to load grading schemes',
        };
    }
}

export async function createGradingScheme(input: {
    name: string;
    type: GradingSchemeType;
    description?: string;
}): Promise<{
    success: boolean;
    data?: GradingSchemeDTO;
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth();
        const scope = tenantScope(tenantId);

        const name = input.name?.trim();
        if (!name) {
            return { success: false, error: 'Scheme name is required.' };
        }
        const schemeType = normalizeSchemeType(input.type || 'GPA');
        const scaleId = randomUUID();

        const defaultThresholds =
            schemeType === 'PERCENTAGE' || schemeType === 'LETTER'
                ? [
                      { grade: 'A+', minPercentage: 90, maxPercentage: 100, gradePoint: null },
                      { grade: 'A', minPercentage: 75, maxPercentage: 89, gradePoint: null },
                      { grade: 'B', minPercentage: 60, maxPercentage: 74, gradePoint: null },
                      { grade: 'C', minPercentage: 45, maxPercentage: 59, gradePoint: null },
                      { grade: 'F', minPercentage: 0, maxPercentage: 44, gradePoint: null },
                  ]
                : [
                      { grade: 'A1', minPercentage: 91, maxPercentage: 100, gradePoint: 10.0 },
                      { grade: 'A2', minPercentage: 81, maxPercentage: 90, gradePoint: 9.0 },
                      { grade: 'B1', minPercentage: 71, maxPercentage: 80, gradePoint: 8.0 },
                      { grade: 'B2', minPercentage: 61, maxPercentage: 70, gradePoint: 7.0 },
                      { grade: 'C1', minPercentage: 51, maxPercentage: 60, gradePoint: 6.0 },
                      { grade: 'C2', minPercentage: 41, maxPercentage: 50, gradePoint: 5.0 },
                      { grade: 'D', minPercentage: 33, maxPercentage: 40, gradePoint: 4.0 },
                      { grade: 'E', minPercentage: 0, maxPercentage: 32, gradePoint: 0.0 },
                  ];

        const createdThresholds: GradeThresholdDTO[] = [];

        await scope.transaction(async (tx) => {
            await tx.insert(gradingScales, {
                id: scaleId,
                name,
                type: schemeType,
            });

            const owned = await tx.claim(gradingScales, scaleId, { forUpdate: true });
            if (!owned) {
                throw new Error('Failed to claim newly created grading scale.');
            }

            for (let i = 0; i < defaultThresholds.length; i++) {
                const t = defaultThresholds[i];
                const rubricId = randomUUID();
                await tx.childInsert(gradingRubrics, owned, 'scaleId', {
                    id: rubricId,
                    label: t.grade,
                    minScore: String(t.minPercentage),
                    maxScore: String(t.maxPercentage),
                    gpaValue: t.gradePoint !== null ? String(t.gradePoint) : null,
                });
                createdThresholds.push({
                    id: rubricId,
                    minPercentage: t.minPercentage,
                    maxPercentage: t.maxPercentage,
                    grade: t.grade,
                    gradePoint: t.gradePoint,
                    remark: deriveRemark(t.minPercentage),
                    displayOrder: i + 1,
                });
            }
        });

        revalidatePath('/settings/grading');

        return {
            success: true,
            data: {
                id: scaleId,
                name,
                type: schemeType,
                description: input.description?.trim() || `${schemeType} grading scale configured for this school`,
                isDefault: false,
                isActive: true,
                thresholds: createdThresholds,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create grading scheme',
        };
    }
}
