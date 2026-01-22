package com.schoolsis.fees.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.fees.application.FeeService;
import com.schoolsis.fees.application.FeeService.FeeStats;
import com.schoolsis.fees.application.FeeService.RecordPaymentCommand;
import com.schoolsis.fees.domain.model.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * REST controller for fee management.
 */
@RestController
@RequestMapping("/api/v1/fees")
public class FeeController {

    private final FeeService feeService;

    public FeeController(FeeService feeService) {
        this.feeService = feeService;
    }

    // ========== Invoice Endpoints ==========

    @GetMapping("/invoices")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<Page<InvoiceResponse>> getInvoices(Pageable pageable) {
        Page<Invoice> invoices = feeService.getInvoices(pageable);
        return ApiResponse.ok(invoices.map(this::toInvoiceResponse));
    }

    @GetMapping("/invoices/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<InvoiceResponse> getInvoice(@PathVariable UUID id) {
        Invoice invoice = feeService.getInvoice(id);
        return ApiResponse.ok(toInvoiceResponse(invoice));
    }

    @GetMapping("/invoices/student/{studentId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT', 'PARENT')")
    public ApiResponse<List<InvoiceResponse>> getStudentInvoices(@PathVariable UUID studentId) {
        List<Invoice> invoices = feeService.getStudentInvoices(studentId);
        return ApiResponse.ok(invoices.stream().map(this::toInvoiceResponse).toList());
    }

    @GetMapping("/invoices/overdue")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<List<InvoiceResponse>> getOverdueInvoices() {
        List<Invoice> invoices = feeService.getOverdueInvoices();
        return ApiResponse.ok(invoices.stream().map(this::toInvoiceResponse).toList());
    }

    // ========== Payment Endpoints ==========

    @PostMapping("/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT')")
    public ApiResponse<PaymentResponse> recordPayment(@Valid @RequestBody RecordPaymentRequest request) {
        RecordPaymentCommand command = new RecordPaymentCommand(
            request.invoiceId(),
            request.amount(),
            request.method(),
            request.transactionRef(),
            request.notes(),
            request.receivedBy()
        );

        Payment payment = feeService.recordPayment(command);
        return ApiResponse.ok(toPaymentResponse(payment));
    }

    @GetMapping("/payments/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<PaymentResponse> getPayment(@PathVariable UUID id) {
        Payment payment = feeService.getPayment(id);
        return ApiResponse.ok(toPaymentResponse(payment));
    }

    @GetMapping("/invoices/{invoiceId}/payments")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<List<PaymentResponse>> getInvoicePayments(@PathVariable UUID invoiceId) {
        List<Payment> payments = feeService.getInvoicePayments(invoiceId);
        return ApiResponse.ok(payments.stream().map(this::toPaymentResponse).toList());
    }

    // ========== Analytics ==========

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<FeeStats> getStats() {
        return ApiResponse.ok(feeService.getFeeStats());
    }

    // ========== DTO Mappings ==========

    private InvoiceResponse toInvoiceResponse(Invoice invoice) {
        return new InvoiceResponse(
            invoice.getId(),
            invoice.getInvoiceNumber(),
            invoice.getStudentId(),
            invoice.getTotalAmount(),
            invoice.getPaidAmount(),
            invoice.getBalanceAmount(),
            invoice.getStatus(),
            invoice.getDueDate(),
            invoice.getIssueDate(),
            invoice.getDescription(),
            invoice.isOverdue(),
            invoice.getCreatedAt()
        );
    }

    private PaymentResponse toPaymentResponse(Payment payment) {
        return new PaymentResponse(
            payment.getId(),
            payment.getReceiptNumber(),
            payment.getInvoiceId(),
            payment.getAmount(),
            payment.getPaymentMethod(),
            payment.getStatus(),
            payment.getTransactionRef(),
            payment.getPaidAt(),
            payment.getCreatedAt()
        );
    }

    // Request/Response records
    public record RecordPaymentRequest(
        @NotNull UUID invoiceId,
        @NotNull @Positive BigDecimal amount,
        @NotNull PaymentMethod method,
        String transactionRef,
        String notes,
        UUID receivedBy
    ) {}

    public record InvoiceResponse(
        UUID id,
        String invoiceNumber,
        UUID studentId,
        BigDecimal totalAmount,
        BigDecimal paidAmount,
        BigDecimal balanceAmount,
        InvoiceStatus status,
        LocalDate dueDate,
        LocalDate issueDate,
        String description,
        boolean overdue,
        Instant createdAt
    ) {}

    public record PaymentResponse(
        UUID id,
        String receiptNumber,
        UUID invoiceId,
        BigDecimal amount,
        PaymentMethod paymentMethod,
        PaymentStatus status,
        String transactionRef,
        Instant paidAt,
        Instant createdAt
    ) {}
}
