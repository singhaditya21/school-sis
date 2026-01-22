package com.schoolsis.fees.application;

import com.schoolsis.fees.domain.model.PaymentOrder;
import com.schoolsis.fees.domain.model.PaymentOrder.PaymentProvider;
import com.schoolsis.fees.domain.model.PaymentOrder.PaymentStatus;
import com.schoolsis.fees.domain.repository.PaymentOrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Service for online payment processing via Razorpay.
 * Handles order creation, verification, and webhook processing.
 */
@Service
@Transactional
public class OnlinePaymentService {

    private static final Logger log = LoggerFactory.getLogger(OnlinePaymentService.class);
    private static final String HMAC_SHA256 = "HmacSHA256";

    private final PaymentOrderRepository repository;

    @Value("${razorpay.key-id:rzp_test_placeholder}")
    private String razorpayKeyId;

    @Value("${razorpay.key-secret:secret_placeholder}")
    private String razorpayKeySecret;

    @Value("${razorpay.enabled:false}")
    private boolean razorpayEnabled;

    public OnlinePaymentService(PaymentOrderRepository repository) {
        this.repository = repository;
    }

    /**
     * Create a payment order for an invoice.
     * In production, this would call Razorpay API to create the order.
     */
    public PaymentOrderResult createOrder(UUID tenantId, CreateOrderRequest request) {
        // Check if invoice already has a successful payment
        if (repository.existsByTenantIdAndInvoiceIdAndStatus(tenantId, request.invoiceId(), PaymentStatus.CAPTURED)) {
            throw new IllegalStateException("Invoice already has a successful payment");
        }

        PaymentOrder order = new PaymentOrder(
                request.invoiceId(),
                request.studentId(),
                request.amount(),
                PaymentProvider.RAZORPAY);
        order.setTenantId(tenantId);

        // In production: Call Razorpay API to create order
        // For now, generate a mock order ID
        String providerOrderId = "order_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
        order.markCreated(providerOrderId);

        PaymentOrder savedOrder = repository.save(order);

        log.info("Created payment order {} for invoice {} amount {}",
                savedOrder.getId(), request.invoiceId(), request.amount());

        return new PaymentOrderResult(
                savedOrder.getId(),
                savedOrder.getProviderOrderId(),
                savedOrder.getAmount(),
                savedOrder.getCurrency(),
                razorpayEnabled ? razorpayKeyId : "rzp_test_demo",
                savedOrder.getStatus().name());
    }

    /**
     * Verify and capture a payment after user completes checkout.
     */
    public PaymentVerificationResult verifyPayment(UUID tenantId, VerifyPaymentRequest request) {
        PaymentOrder order = repository.findByProviderOrderId(request.orderId())
                .orElseThrow(() -> new IllegalArgumentException("Payment order not found"));

        if (!order.getTenantId().equals(tenantId)) {
            throw new IllegalArgumentException("Payment order belongs to different tenant");
        }

        // Verify signature (in production with real Razorpay)
        boolean isValid = verifySignature(request.orderId(), request.paymentId(), request.signature());

        if (isValid || !razorpayEnabled) {
            // For demo, accept all payments when Razorpay is disabled
            order.markCaptured(request.paymentId(), request.signature());
            repository.save(order);

            log.info("Payment captured for order {} paymentId {}", request.orderId(), request.paymentId());

            return new PaymentVerificationResult(
                    true,
                    order.getId(),
                    order.getInvoiceId(),
                    order.getAmount(),
                    "Payment successful");
        } else {
            order.markFailed("Signature verification failed");
            repository.save(order);

            log.warn("Payment verification failed for order {}", request.orderId());

            return new PaymentVerificationResult(
                    false,
                    order.getId(),
                    order.getInvoiceId(),
                    order.getAmount(),
                    "Payment verification failed");
        }
    }

    /**
     * Verify Razorpay signature using HMAC-SHA256.
     */
    private boolean verifySignature(String orderId, String paymentId, String signature) {
        if (!razorpayEnabled) {
            return true; // Skip verification in demo mode
        }

        try {
            String payload = orderId + "|" + paymentId;
            Mac mac = Mac.getInstance(HMAC_SHA256);
            SecretKeySpec secretKey = new SecretKeySpec(
                    razorpayKeySecret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256);
            mac.init(secretKey);
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String expectedSignature = HexFormat.of().formatHex(hash);
            return expectedSignature.equals(signature);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            log.error("Error verifying signature", e);
            return false;
        }
    }

    /**
     * Get payment orders for an invoice.
     */
    @Transactional(readOnly = true)
    public List<PaymentOrder> getOrdersForInvoice(UUID tenantId, UUID invoiceId) {
        return repository.findByTenantIdAndInvoiceIdOrderByCreatedAtDesc(tenantId, invoiceId);
    }

    /**
     * Get payment orders for a student.
     */
    @Transactional(readOnly = true)
    public List<PaymentOrder> getOrdersForStudent(UUID tenantId, UUID studentId) {
        return repository.findByTenantIdAndStudentIdOrderByCreatedAtDesc(tenantId, studentId);
    }

    /**
     * Check if invoice is paid online.
     */
    @Transactional(readOnly = true)
    public boolean isInvoicePaidOnline(UUID tenantId, UUID invoiceId) {
        return repository.existsByTenantIdAndInvoiceIdAndStatus(tenantId, invoiceId, PaymentStatus.CAPTURED);
    }

    // Request/Response records

    public record CreateOrderRequest(
            UUID invoiceId,
            UUID studentId,
            BigDecimal amount,
            String description) {
    }

    public record PaymentOrderResult(
            UUID orderId,
            String providerOrderId,
            BigDecimal amount,
            String currency,
            String keyId,
            String status) {
    }

    public record VerifyPaymentRequest(
            String orderId,
            String paymentId,
            String signature) {
    }

    public record PaymentVerificationResult(
            boolean success,
            UUID orderId,
            UUID invoiceId,
            BigDecimal amount,
            String message) {
    }
}
