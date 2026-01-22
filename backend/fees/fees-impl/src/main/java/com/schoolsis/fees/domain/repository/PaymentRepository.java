package com.schoolsis.fees.domain.repository;

import com.schoolsis.fees.domain.model.Payment;
import com.schoolsis.fees.domain.model.PaymentStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Payment entity.
 */
@Repository
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    @Query("SELECT p FROM Payment p WHERE p.tenantId = :tenantId ORDER BY p.paidAt DESC")
    Page<Payment> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT p FROM Payment p WHERE p.tenantId = :tenantId AND p.id = :id")
    Optional<Payment> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT p FROM Payment p WHERE p.invoiceId = :invoiceId ORDER BY p.paidAt DESC")
    List<Payment> findByInvoiceId(UUID invoiceId);

    @Query("SELECT p FROM Payment p WHERE p.tenantId = :tenantId AND p.paidAt BETWEEN :start AND :end ORDER BY p.paidAt DESC")
    List<Payment> findByTenantIdAndPaidAtBetween(UUID tenantId, Instant start, Instant end);

    @Query("SELECT SUM(p.amount) FROM Payment p WHERE p.tenantId = :tenantId AND p.status = 'COMPLETED' AND p.paidAt BETWEEN :start AND :end")
    BigDecimal sumCollectedAmountBetween(UUID tenantId, Instant start, Instant end);

    @Query("SELECT COUNT(p) FROM Payment p WHERE p.tenantId = :tenantId AND p.status = :status")
    long countByTenantIdAndStatus(UUID tenantId, PaymentStatus status);

    Optional<Payment> findByReceiptNumber(String receiptNumber);
}
