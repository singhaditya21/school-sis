import {
    gradeFromScale,
    GradingConfigurationError,
    loadDefaultGradingScale,
    type DefaultGradingScale,
} from '@/lib/grading/calculator';

const TENANT_ID = '5747e37e-10a9-4c78-ae17-d2fa7c437d30';

const scale: DefaultGradingScale = {
    id: 'b2ec7f65-62d2-430f-9e6f-628c24d37101',
    name: 'Tenant scale',
    updatedAt: '2026-08-09T00:00:00.000Z',
    thresholds: [
        { grade: 'Needs support', minPercentage: 0, maxPercentage: 50, gradePoint: null, remark: '' },
        { grade: 'Meets standard', minPercentage: 50, maxPercentage: 80, gradePoint: null, remark: '' },
        { grade: 'Exceeds standard', minPercentage: 80, maxPercentage: 100, gradePoint: null, remark: '' },
    ],
};

describe('tenant grading calculator', () => {
    it('loads only the active default scale for the session tenant', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [
            {
                scaleId: scale.id,
                scaleName: scale.name,
                scaleUpdatedAt: scale.updatedAt,
                label: 'Needs support',
                minScore: '0.00',
                maxScore: '50.00',
                gpaValue: null,
                remark: null,
            },
            {
                scaleId: scale.id,
                scaleName: scale.name,
                scaleUpdatedAt: scale.updatedAt,
                label: 'Meets standard',
                minScore: '50.00',
                maxScore: '100.00',
                gpaValue: null,
                remark: null,
            },
        ] });

        const result = await loadDefaultGradingScale(query, TENANT_ID);

        expect(result.id).toBe(scale.id);
        expect(result.thresholds).toHaveLength(2);
        expect(query).toHaveBeenCalledWith(expect.stringContaining('scale.is_default = TRUE'), [TENANT_ID]);
    });

    it('fails explicitly when no active default scale exists', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [] });
        await expect(loadDefaultGradingScale(query, TENANT_ID)).rejects.toThrow(GradingConfigurationError);
    });

    it.each([
        [40, 'Needs support'],
        [50, 'Meets standard'],
        [80, 'Exceeds standard'],
        [100, 'Exceeds standard'],
    ])('uses persisted boundaries for %s%%', (marks, expected) => {
        expect(gradeFromScale(scale, marks, 100, false)).toBe(expected);
    });

    it('uses AB only for a mark-free absent result', () => {
        expect(gradeFromScale(null, null, 100, true)).toBe('AB');
        expect(() => gradeFromScale(null, 1, 100, true)).toThrow(GradingConfigurationError);
    });

    it('rejects out-of-range marks instead of silently assigning a grade', () => {
        expect(() => gradeFromScale(scale, 101, 100, false)).toThrow(GradingConfigurationError);
    });
});
