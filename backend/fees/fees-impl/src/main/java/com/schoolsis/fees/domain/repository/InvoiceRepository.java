package com.schoolsis.fees.domain.repository;

import com.schoolsis.fees.domain.model.Invoice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Invoice entity.
 */
@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    @Query("SELECT i FROM Invoice i WHERE i.tenantId = :tenantId ORDER BY i.createdAt DESC")
    Page<Invoice> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT i FROM Invoice i WHERE i.tenantId = :tenantId AND i.id = :id")
    Optional<Invoice> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT i FROM Invoice i WHERE i.tenantId = :tenantId AND i.studentId = :studentId ORDER BY i.dueDate DESC")
    List<Invoice> findByTenantIdAndStudentId(UUID tenantId, UUID studentId);

    @Query("SELECT i FROM Invoice i WHERE i.tenantId = :tenantId AND i.status = :status ORDER BY i.dueDate")
    List<Invoice> findByTenantIdAndStatus(UUID tenantId, String status);

    @Query("SELECT i FROM Invoice i WHERE i.tenantId = :tenantId AND i.status IN :statuses AND i.dueDate < :date ORDER BY i.dueDate")
    List<Invoice> findOverdueInvoices(UUID tenantId, List<String> statuses, LocalDate date);

    @Query("SELECT SUM(i.amount - i.paidAmount) FROM Invoice i WHERE i.tenantId = :tenantId AND i.status IN ('PENDING', 'PARTIAL')")
    BigDecimal sumOutstandingBalance(UUID tenantId);

    @Query("SELECT COUNT(i) FROM Invoice i WHERE i.tenantId = :tenantId AND i.status = :status")
    long countByTenantIdAndStatus(UUID tenantId, String status);

    @Query("SELECT COUNT(i) FROM Invoice i WHERE i.tenantId = :tenantId AND i.status IN ('PENDING', 'PARTIAL') AND i.dueDate < :date")
    long countOverdue(UUID tenantId, LocalDate date);

    boolean existsByInvoiceNumber(String invoiceNumber);
}
