// Display labels for the Postgres enums behind the HR module.
// Keys mirror leave_type, leave_status, staff_status and employment_type.

export const LEAVE_TYPE_LABELS: Record<string, string> = {
    CL: 'Casual',
    SL: 'Sick',
    EL: 'Earned',
    ML: 'Maternity',
    PL: 'Paternity',
    COMP_OFF: 'Comp Off',
    LWP: 'Leave Without Pay',
};

export const LEAVE_TYPE_OPTIONS = ['CL', 'SL', 'EL', 'ML', 'PL', 'COMP_OFF', 'LWP'] as const;

export const LEAVE_STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
    FULL_TIME: 'Full time',
    PART_TIME: 'Part time',
    CONTRACT: 'Contract',
    VISITING: 'Visiting',
};

export const EMPLOYMENT_TYPE_OPTIONS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'] as const;

export const STAFF_STATUS_LABELS: Record<string, string> = {
    ACTIVE: 'Active',
    ON_LEAVE: 'On leave',
    RESIGNED: 'Resigned',
    TERMINATED: 'Terminated',
    PROBATION: 'Probation',
};

export function leaveTypeLabel(value: string): string {
    return LEAVE_TYPE_LABELS[value] ?? value;
}

export function employmentTypeLabel(value: string): string {
    return EMPLOYMENT_TYPE_LABELS[value] ?? value.replace(/_/g, ' ');
}

export function staffStatusLabel(value: string): string {
    return STAFF_STATUS_LABELS[value] ?? value.replace(/_/g, ' ');
}

const STAFF_STATUS_CLASSES: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    ON_LEAVE: 'bg-amber-100 text-amber-700',
    PROBATION: 'bg-blue-100 text-blue-700',
    RESIGNED: 'bg-muted text-muted-foreground',
    TERMINATED: 'bg-red-100 text-red-700',
};

export function staffStatusClass(value: string): string {
    return STAFF_STATUS_CLASSES[value] ?? 'bg-muted text-muted-foreground';
}

const LEAVE_STATUS_CLASSES: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-muted text-muted-foreground',
};

export function leaveStatusClass(value: string): string {
    return LEAVE_STATUS_CLASSES[value] ?? 'bg-muted text-muted-foreground';
}

/** Dates arrive from pg as `Date` for `date` columns; render them in en-IN. */
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Inclusive whole-day count between two ISO date strings, or 0 when invalid. */
export function inclusiveDays(fromDate: string, toDate: string): number {
    if (!fromDate || !toDate) return 0;
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    const diff = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    return diff > 0 ? diff : 0;
}
