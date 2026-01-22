package com.schoolsis.fees.domain.repository;

import com.schoolsis.fees.domain.model.PaymentOrder;
import com.schoolsis.fees.domain.model.PaymentOrder.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for PaymentOrder entity.
 */
@Repository
public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, UUID> {

    /**
     * Find payment orders for an invoice.
     */
    List<PaymentOrder> findByTenantIdAndInvoiceIdOrderByCreatedAtDesc(UUID tenantId, UUID invoiceId);

    /**
     * Find payment orders for a student.
     */
    List<PaymentOrder> findByTenantIdAndStudentIdOrderByCreatedAtDesc(UUID tenantId, UUID studentId);

    /**
     * Find payment order by provider order ID.
     */
    Optional<PaymentOrder> findByProviderOrderId(String providerOrderId);

    /**
     * Find successful payment for an invoice.
     */
    Optional<PaymentOrder> findByTenantIdAndInvoiceIdAndStatus(UUID tenantId, UUID invoiceId, PaymentStatus status);

    /**
     * Find pending payments for a tenant.
     */
    List<PaymentOrder> findByTenantIdAndStatusOrderByCreatedAtDesc(UUID tenantId, PaymentStatus status);

    /**
     * Check if invoice has a successful payment.
     */
    boolean existsByTenantIdAndInvoiceIdAndStatus(UUID tenantId, UUID invoiceId, PaymentStatus status);
}
