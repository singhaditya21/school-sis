package com.schoolsis.fees.domain.model;

/**
 * Payment status enum.
 * Maps to PaymentStatus from Prisma schema.
 */
public enum PaymentStatus {
    PENDING,
    COMPLETED,
    FAILED,
    REFUNDED
}
