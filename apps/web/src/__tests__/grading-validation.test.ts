import {
    createGradingSchemeSchema,
    gradeForPercentage,
    type GradeThresholdInput,
} from '@/lib/grading/validation';

const contiguousThresholds: GradeThresholdInput[] = [
    { grade: 'A', minPercentage: 90, maxPercentage: 100, gradePoint: 4, remark: 'Excellent' },
    { grade: 'C', minPercentage: 0, maxPercentage: 40, gradePoint: 2, remark: 'Needs support' },
    { grade: 'B', minPercentage: 40, maxPercentage: 90, gradePoint: 3, remark: 'Meets expectations' },
];

function schemeInput(thresholds: GradeThresholdInput[] = contiguousThresholds) {
    return {
        name: '2026 Academic Scale',
        type: 'GPA' as const,
        description: 'Approved scale for the 2026 academic year.',
        isDefault: true,
        isActive: true,
        thresholds,
    };
}

describe('grading scheme validation', () => {
    it('accepts thresholds that cover 0 through 100 exactly, independent of display order', () => {
        expect(createGradingSchemeSchema.safeParse(schemeInput()).success).toBe(true);
    });

    it('rejects a gap between adjacent thresholds', () => {
        const result = createGradingSchemeSchema.safeParse(schemeInput([
            { ...contiguousThresholds[1], maxPercentage: 39.99 },
            contiguousThresholds[2],
            contiguousThresholds[0],
        ]));

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.message.includes('Gap between'))).toBe(true);
        }
    });

    it('rejects overlapping thresholds', () => {
        const result = createGradingSchemeSchema.safeParse(schemeInput([
            { ...contiguousThresholds[1], maxPercentage: 41 },
            contiguousThresholds[2],
            contiguousThresholds[0],
        ]));

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.message.includes('Overlap between'))).toBe(true);
        }
    });

    it('requires the default scheme to remain active and GPA ranges to have grade points', () => {
        const inactiveDefault = createGradingSchemeSchema.safeParse({
            ...schemeInput(),
            isActive: false,
        });
        const missingGradePoint = createGradingSchemeSchema.safeParse(schemeInput([
            { ...contiguousThresholds[0], gradePoint: null },
            contiguousThresholds[1],
            contiguousThresholds[2],
        ]));

        expect(inactiveDefault.success).toBe(false);
        expect(missingGradePoint.success).toBe(false);
    });

    it('uses lower-inclusive boundaries and includes 100 in the final range', () => {
        expect(gradeForPercentage(contiguousThresholds, 39.99)?.grade).toBe('C');
        expect(gradeForPercentage(contiguousThresholds, 40)?.grade).toBe('B');
        expect(gradeForPercentage(contiguousThresholds, 90)?.grade).toBe('A');
        expect(gradeForPercentage(contiguousThresholds, 100)?.grade).toBe('A');
        expect(gradeForPercentage(contiguousThresholds, 100.01)).toBeNull();
    });
});
