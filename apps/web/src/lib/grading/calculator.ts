import { gradeForPercentage, type GradeThresholdInput } from './validation';

type QueryExecutor = (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

export interface DefaultGradingScale {
    id: string;
    name: string;
    updatedAt: string;
    thresholds: GradeThresholdInput[];
}

type DefaultScaleRow = {
    scaleId: string;
    scaleName: string;
    scaleUpdatedAt: Date | string;
    label: string;
    minScore: string | number;
    maxScore: string | number;
    gpaValue: string | number | null;
    remark: string | null;
};

export class GradingConfigurationError extends Error {}

export async function loadDefaultGradingScale(
    query: QueryExecutor,
    tenantId: string,
): Promise<DefaultGradingScale> {
    const result = await query(`
        SELECT
            scale.id AS "scaleId",
            scale.name AS "scaleName",
            scale.updated_at AS "scaleUpdatedAt",
            rubric.label,
            rubric.min_score AS "minScore",
            rubric.max_score AS "maxScore",
            rubric.gpa_value AS "gpaValue",
            rubric.remark
        FROM grading_scales scale
        INNER JOIN grading_rubrics rubric ON rubric.scale_id = scale.id
        WHERE scale.tenant_id = $1
          AND scale.is_default = TRUE
          AND scale.is_active = TRUE
        ORDER BY rubric.display_order ASC, rubric.id ASC
    `, [tenantId]);

    const rows = result.rows as DefaultScaleRow[];
    if (rows.length === 0) {
        throw new GradingConfigurationError(
            'Configure an active default grading scheme before entering marks.',
        );
    }

    const first = rows[0];
    return {
        id: first.scaleId,
        name: first.scaleName,
        updatedAt: new Date(first.scaleUpdatedAt).toISOString(),
        thresholds: rows.map(row => ({
            grade: row.label,
            minPercentage: Number(row.minScore),
            maxPercentage: Number(row.maxScore),
            gradePoint: row.gpaValue === null ? null : Number(row.gpaValue),
            remark: row.remark || '',
        })),
    };
}

export function gradeFromScale(
    scale: DefaultGradingScale | null,
    marksObtained: number | null,
    maxMarks: number,
    isAbsent: boolean,
): string {
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
        throw new GradingConfigurationError('The exam schedule has an invalid maximum mark value.');
    }
    if (isAbsent) {
        if (marksObtained !== null) {
            throw new GradingConfigurationError('Absent results must not contain awarded marks.');
        }
        return 'AB';
    }
    if (marksObtained === null || !Number.isFinite(marksObtained) || marksObtained < 0 || marksObtained > maxMarks) {
        throw new GradingConfigurationError(`Marks must be between 0 and ${maxMarks}.`);
    }
    if (!scale) {
        throw new GradingConfigurationError('An active default grading scheme is required.');
    }

    const threshold = gradeForPercentage(scale.thresholds, (marksObtained / maxMarks) * 100);
    if (!threshold) {
        throw new GradingConfigurationError('The default grading scheme does not cover this result.');
    }
    return threshold.grade;
}
