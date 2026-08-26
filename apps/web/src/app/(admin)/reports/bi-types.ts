import type { BiFormat } from '@school-sis/api';

export type BiReportRow = Record<string, string | number | null>;

export interface BiReportColumn {
    label: string;
    kind: 'dimension' | 'metric';
    format: BiFormat | 'text';
}

/** Serialisable projection of a catalog dataset for the client report builder. */
export interface ReportDatasetOption {
    id: string;
    label: string;
    description: string;
    domain: string;
    /** What the optional date range actually filters on, e.g. "invoice due date". */
    dateFilterLabel: string | null;
    executable: boolean;
    /** Populated when `executable` is false — the plain reason, shown to the user. */
    unavailableReason: string | null;
    metrics: { id: string; label: string; description: string; format: BiFormat }[];
    dimensions: { id: string; label: string; filterable: boolean; type: string }[];
    exportPolicy: {
        id: string;
        label: string;
        maxRows: number;
        requiresReason: boolean;
        requiresApproval: boolean;
    } | null;
}

export interface ReportWorkspace {
    generatedAt: string;
    datasets: ReportDatasetOption[];
    governanceSignals: string[];
    /** Dashboards the catalog says this actor can see, with the route that renders them. */
    dashboards: { id: string; title: string; description: string; route: string }[];
}
