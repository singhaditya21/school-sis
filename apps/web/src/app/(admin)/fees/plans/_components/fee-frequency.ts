/**
 * The fee_frequency enum, mirrored for the fee plan forms.
 * Values must stay identical to the database enum — the server actions
 * validate against the same allowlist before any INSERT.
 */
export const FEE_FREQUENCY_OPTIONS = [
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'TERM_WISE', label: 'Term-wise' },
    { value: 'ANNUAL', label: 'Annual' },
    { value: 'ONE_TIME', label: 'One-time' },
] as const;

export const DEFAULT_FEE_FREQUENCY = 'ANNUAL';

export function formatFeeFrequency(value: string): string {
    return FEE_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
