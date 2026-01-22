package com.schoolsis.fees.application;

import com.schoolsis.common.exception.EntityNotFoundException;
import com.schoolsis.fees.domain.model.*;
import com.schoolsis.fees.domain.repository.InvoiceRepository;
import com.schoolsis.fees.domain.repository.PaymentRepository;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * Service for fee management - invoices, payments, receipts.
 */
@Service
@Transactional
public class FeeService {

    private final InvoiceRepository invoiceRepository;
    private final PaymentRepository paymentRepository;
    private final AuditService auditService;

    public FeeService(
        InvoiceRepository invoiceRepository,
        PaymentRepository paymentRepository,
        AuditService auditService
    ) {
        this.invoiceRepository = invoiceRepository;
        this.paymentRepository = paymentRepository;
        this.auditService = auditService;
    }

    // ========== Invoice Operations ==========

    @Transactional(readOnly = true)
    public Page<Invoice> getInvoices(Pageable pageable) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return invoiceRepository.findByTenantId(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public Invoice getInvoice(UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return invoiceRepository.findByTenantIdAndId(tenantId, id)
            .orElseThrow(() -> new EntityNotFoundException("Invoice", id));
    }

    @Transactional(readOnly = true)
    public List<Invoice> getStudentInvoices(UUID studentId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return invoiceRepository.findByTenantIdAndStudentId(tenantId, studentId);
    }

    @Transactional(readOnly = true)
    public List<Invoice> getOverdueInvoices() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<InvoiceStatus> statuses = List.of(InvoiceStatus.PENDING, InvoiceStatus.PARTIAL);
        return invoiceRepository.findOverdueInvoices(tenantId, statuses, LocalDate.now());
    }

    // ========== Payment Operations ==========

    /**
     * Record a payment against an invoice.
     */
    public Payment recordPayment(RecordPaymentCommand command) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        Invoice invoice = invoiceRepository.findByTenantIdAndId(tenantId, command.invoiceId())
            .orElseThrow(() -> new EntityNotFoundException("Invoice", command.invoiceId()));

        if (invoice.getStatus() == InvoiceStatus.PAID) {
            throw new IllegalStateException("Invoice is already fully paid");
        }

        if (invoice.getStatus() == InvoiceStatus.CANCELLED) {
            throw new IllegalStateException("Cannot pay a cancelled invoice");
        }

        // Create payment
        Payment payment = new Payment(command.invoiceId(), command.amount(), command.method());
        payment.setTenantId(tenantId);
        payment.setReceiptNumber(generateReceiptNumber());
        payment.setTransactionRef(command.transactionRef());
        payment.setNotes(command.notes());
        payment.setReceivedBy(command.receivedBy());
        payment.complete();

        payment = paymentRepository.save(payment);

        // Update invoice
        invoice.recordPayment(command.amount());
        invoiceRepository.save(invoice);

        auditService.log(tenantId, command.receivedBy(), "CREATE", "Payment", payment.getId());

        return payment;
    }

    @Transactional(readOnly = true)
    public Payment getPayment(UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return paymentRepository.findByTenantIdAndId(tenantId, id)
            .orElseThrow(() -> new EntityNotFoundException("Payment", id));
    }

    @Transactional(readOnly = true)
    public List<Payment> getInvoicePayments(UUID invoiceId) {
        return paymentRepository.findByInvoiceId(invoiceId);
    }

    // ========== Analytics ==========

    @Transactional(readOnly = true)
    public FeeStats getFeeStats() {
        UUID tenantId = TenantContext.getCurrentTenantId();

        BigDecimal outstanding = invoiceRepository.sumOutstandingBalance(tenantId);
        long pendingCount = invoiceRepository.countByTenantIdAndStatus(tenantId, InvoiceStatus.PENDING);
        long overdueCount = invoiceRepository.countByTenantIdAndStatus(tenantId, InvoiceStatus.OVERDUE);

        // Today's collections
        Instant startOfDay = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant endOfDay = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        BigDecimal todayCollected = paymentRepository.sumCollectedAmountBetween(tenantId, startOfDay, endOfDay);

        return new FeeStats(
            outstanding != null ? outstanding : BigDecimal.ZERO,
            todayCollected != null ? todayCollected : BigDecimal.ZERO,
            pendingCount,
            overdueCount
        );
    }

    // ========== Helpers ==========

    private String generateReceiptNumber() {
        return "RCP-" + System.currentTimeMillis();
    }

    // Command and result records
    public record RecordPaymentCommand(
        UUID invoiceId,
        BigDecimal amount,
        PaymentMethod method,
        String transactionRef,
        String notes,
        UUID receivedBy
    ) {}

    public record FeeStats(
        BigDecimal totalOutstanding,
        BigDecimal todayCollected,
        long pendingInvoices,
        long overdueInvoices
    ) {}
}
