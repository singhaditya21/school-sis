import { z } from 'zod';

export const GRADING_SCHEME_TYPES = ['PERCENTAGE', 'GPA', 'CGPA', 'LETTER'] as const;
export type GradingSchemeType = (typeof GRADING_SCHEME_TYPES)[number];

export interface GradeThresholdInput {
    grade: string;
    minPercentage: number;
    maxPercentage: number;
    gradePoint: number | null;
    remark: string;
}

export interface GradeThreshold extends GradeThresholdInput {
    id: string;
    displayOrder: number;
}

export interface GradingScheme {
    id: string;
    name: string;
    type: GradingSchemeType;
    description: string;
    isDefault: boolean;
    isActive: boolean;
    updatedAt: string;
    thresholds: GradeThreshold[];
}

const percentageSchema = z.number()
    .finite()
    .min(0, 'Percentage cannot be below 0.')
    .max(100, 'Percentage cannot exceed 100.')
    .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, {
        message: 'Use no more than two decimal places.',
    });

const thresholdInputSchema = z.object({
    grade: z.string().trim().min(1, 'Grade is required.').max(50),
    minPercentage: percentageSchema,
    maxPercentage: percentageSchema,
    gradePoint: z.number().finite().min(0).max(100).nullable(),
    remark: z.string().trim().max(255).default(''),
});

const gradingSchemeFields = {
    name: z.string().trim().min(3, 'Scheme name must be at least 3 characters.').max(255),
    type: z.enum(GRADING_SCHEME_TYPES),
    description: z.string().trim().max(1000).default(''),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    thresholds: z.array(thresholdInputSchema).min(1, 'Add at least one grade threshold.').max(50),
};

type RefinementContext = z.RefinementCtx;
type SchemeForValidation = z.infer<z.ZodObject<typeof gradingSchemeFields>>;

function percentageUnits(value: number): number {
    return Math.round(value * 100);
}

function validateScheme(data: SchemeForValidation, context: RefinementContext): void {
    if (data.isDefault && !data.isActive) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'The default grading scheme must be active.',
            path: ['isActive'],
        });
    }

    if ((data.type === 'GPA' || data.type === 'CGPA') && data.thresholds.some(threshold => threshold.gradePoint === null)) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Every GPA or CGPA threshold requires a grade point.',
            path: ['thresholds'],
        });
    }

    const labels = new Set<string>();
    data.thresholds.forEach((threshold, index) => {
        const normalizedLabel = threshold.grade.toLocaleLowerCase();
        if (labels.has(normalizedLabel)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Grade "${threshold.grade}" is duplicated.`,
                path: ['thresholds', index, 'grade'],
            });
        }
        labels.add(normalizedLabel);

        if (percentageUnits(threshold.minPercentage) >= percentageUnits(threshold.maxPercentage)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Maximum percentage must be greater than minimum percentage.',
                path: ['thresholds', index, 'maxPercentage'],
            });
        }
    });

    const sorted = data.thresholds
        .map((threshold, originalIndex) => ({ threshold, originalIndex }))
        .sort((left, right) => percentageUnits(left.threshold.minPercentage) - percentageUnits(right.threshold.minPercentage));

    if (sorted.length === 0) return;

    if (percentageUnits(sorted[0].threshold.minPercentage) !== 0) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Thresholds must start at 0%.',
            path: ['thresholds', sorted[0].originalIndex, 'minPercentage'],
        });
    }

    for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const previousMaximum = percentageUnits(previous.threshold.maxPercentage);
        const currentMinimum = percentageUnits(current.threshold.minPercentage);

        if (currentMinimum > previousMaximum) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Gap between ${previous.threshold.grade} and ${current.threshold.grade}.`,
                path: ['thresholds', current.originalIndex, 'minPercentage'],
            });
        } else if (currentMinimum < previousMaximum) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Overlap between ${previous.threshold.grade} and ${current.threshold.grade}.`,
                path: ['thresholds', current.originalIndex, 'minPercentage'],
            });
        }
    }

    const last = sorted[sorted.length - 1];
    if (percentageUnits(last.threshold.maxPercentage) !== 10_000) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Thresholds must end at 100%.',
            path: ['thresholds', last.originalIndex, 'maxPercentage'],
        });
    }
}

export const createGradingSchemeSchema = z.object(gradingSchemeFields).superRefine(validateScheme);

export const updateGradingSchemeSchema = z.object({
    ...gradingSchemeFields,
    id: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
}).superRefine(validateScheme);

export const deleteGradingSchemeSchema = z.object({
    id: z.string().uuid(),
    updatedAt: z.string().datetime({ offset: true }),
});

export type CreateGradingSchemeInput = z.infer<typeof createGradingSchemeSchema>;
export type UpdateGradingSchemeInput = z.infer<typeof updateGradingSchemeSchema>;

export function gradeForPercentage(
    thresholds: readonly GradeThresholdInput[],
    percentage: number,
): GradeThresholdInput | null {
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;

    return thresholds.find(threshold => (
        percentage >= threshold.minPercentage
        && (percentage < threshold.maxPercentage || (threshold.maxPercentage === 100 && percentage <= 100))
    )) ?? null;
}
