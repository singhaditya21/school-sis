package com.schoolsis.fees.domain.model;

/**
 * Payment method enum.
 * Maps to PaymentMethod from Prisma schema.
 */
public enum PaymentMethod {
    CASH,
    UPI,
    BANK_TRANSFER,
    CHEQUE,
    CARD,
    ONLINE
}
