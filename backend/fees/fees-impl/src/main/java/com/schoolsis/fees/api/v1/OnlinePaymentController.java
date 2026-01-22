package com.schoolsis.fees.api.v1;

import com.schoolsis.fees.application.OnlinePaymentService;
import com.schoolsis.fees.application.OnlinePaymentService.*;
import com.schoolsis.fees.domain.model.PaymentOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * REST API for online payment processing.
 */
@RestController
@RequestMapping("/api/v1/payments")
public class OnlinePaymentController {

    private final OnlinePaymentService paymentService;

    public OnlinePaymentController(OnlinePaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /**
     * Create a payment order for an invoice.
     */
    @PostMapping("/create-order")
    public ResponseEntity<PaymentOrderResult> createOrder(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @Valid @RequestBody CreatePaymentOrderRequest request) {

        CreateOrderRequest serviceRequest = new CreateOrderRequest(
                request.invoiceId(),
                request.studentId(),
                request.amount(),
                request.description());

        PaymentOrderResult result = paymentService.createOrder(tenantId, serviceRequest);
        return ResponseEntity.ok(result);
    }

    /**
     * Verify payment after checkout completion.
     */
    @PostMapping("/verify")
    public ResponseEntity<PaymentVerificationResult> verifyPayment(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @Valid @RequestBody VerifyPaymentRequest request) {

        OnlinePaymentService.VerifyPaymentRequest serviceRequest = new OnlinePaymentService.VerifyPaymentRequest(
                request.razorpayOrderId(),
                request.razorpayPaymentId(),
                request.razorpaySignature());

        PaymentVerificationResult result = paymentService.verifyPayment(tenantId, serviceRequest);
        return ResponseEntity.ok(result);
    }

    /**
     * Get payment orders for an invoice.
     */
    @GetMapping("/invoices/{invoiceId}")
    public ResponseEntity<List<PaymentOrderResponse>> getOrdersForInvoice(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID invoiceId) {

        List<PaymentOrder> orders = paymentService.getOrdersForInvoice(tenantId, invoiceId);
        List<PaymentOrderResponse> responses = orders.stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(responses);
    }

    /**
     * Get payment orders for a student.
     */
    @GetMapping("/students/{studentId}")
    public ResponseEntity<List<PaymentOrderResponse>> getOrdersForStudent(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID studentId) {

        List<PaymentOrder> orders = paymentService.getOrdersForStudent(tenantId, studentId);
        List<PaymentOrderResponse> responses = orders.stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(responses);
    }

    /**
     * Check if invoice is paid online.
     */
    @GetMapping("/invoices/{invoiceId}/status")
    public ResponseEntity<PaymentStatusResponse> getInvoicePaymentStatus(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID invoiceId) {

        boolean isPaid = paymentService.isInvoicePaidOnline(tenantId, invoiceId);
        return ResponseEntity.ok(new PaymentStatusResponse(invoiceId, isPaid));
    }

    // Request DTOs
    public record CreatePaymentOrderRequest(
            @NotNull UUID invoiceId,
            @NotNull UUID studentId,
            @NotNull BigDecimal amount,
            String description) {
    }

    public record VerifyPaymentRequest(
            @NotBlank String razorpayOrderId,
            @NotBlank String razorpayPaymentId,
            @NotBlank String razorpaySignature) {
    }

    // Response DTOs
    public record PaymentOrderResponse(
            UUID id,
            UUID invoiceId,
            UUID studentId,
            BigDecimal amount,
            String currency,
            String status,
            String provider,
            String providerOrderId,
            String providerPaymentId,
            Integer attemptCount,
            Instant paidAt,
            Instant createdAt) {
    }

    public record PaymentStatusResponse(
            UUID invoiceId,
            boolean paidOnline) {
    }

    private PaymentOrderResponse toResponse(PaymentOrder order) {
        return new PaymentOrderResponse(
                order.getId(),
                order.getInvoiceId(),
                order.getStudentId(),
                order.getAmount(),
                order.getCurrency(),
                order.getStatus().name(),
                order.getProvider().name(),
                order.getProviderOrderId(),
                order.getProviderPaymentId(),
                order.getAttemptCount(),
                order.getPaidAt(),
                order.getCreatedAt());
    }
}
