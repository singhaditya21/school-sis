package com.schoolsis.fees.domain.model;

/**
 * Invoice status enum.
 * Maps to InvoiceStatus from Prisma schema.
 */
public enum InvoiceStatus {
    DRAFT,
    PENDING,
    PARTIAL,
    PAID,
    OVERDUE,
    CANCELLED
}
