import * as React from "react"

import { Badge, type BadgeProps } from "./badge"

type Intent = NonNullable<BadgeProps["variant"]>

/**
 * Maps the domain status strings this SIS uses (invoices, students, attendance,
 * payments, admissions, approvals…) to a semantic Badge intent, so statuses read
 * consistently everywhere instead of each table picking its own colors.
 */
const STATUS_INTENT: Record<string, Intent> = {
    // positive / done
    ACTIVE: "success",
    PAID: "success",
    APPROVED: "success",
    COMPLETED: "success",
    PRESENT: "success",
    ENROLLED: "success",
    RESOLVED: "success",
    VERIFIED: "success",
    // in-progress / needs attention
    PENDING: "warning",
    PARTIAL: "warning",
    IN_PROGRESS: "warning",
    PROCESSING: "warning",
    SUBMITTED: "warning",
    ON_LEAVE: "warning",
    LATE: "warning",
    DRAFT: "warning",
    // negative / failed
    OVERDUE: "destructive",
    REJECTED: "destructive",
    FAILED: "destructive",
    ABSENT: "destructive",
    INACTIVE: "destructive",
    CANCELLED: "destructive",
    SUSPENDED: "destructive",
    EXPIRED: "destructive",
    // informational
    NEW: "info",
    SCHEDULED: "info",
    INFO: "info",
}

function humanize(status: string): string {
    return status
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface StatusBadgeProps
    extends Omit<BadgeProps, "variant" | "children"> {
    status: string
    /** Override the auto-mapped intent. */
    intent?: Intent
    /** Render the raw status instead of the humanized label. */
    raw?: boolean
}

function StatusBadge({ status, intent, raw, ...props }: StatusBadgeProps) {
    const key = status?.toUpperCase().replace(/[\s-]+/g, "_")
    const variant = intent ?? STATUS_INTENT[key] ?? "secondary"
    return (
        <Badge variant={variant} {...props}>
            {raw ? status : humanize(status)}
        </Badge>
    )
}

export { StatusBadge }
