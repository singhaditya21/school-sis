package com.schoolsis.fees.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.fees.application.RazorpayService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST Controller for payment gateway operations.
 * Handles Razorpay order creation, payment verification, and history.
 */
@RestController
@RequestMapping("/api/v1/payments")
@PreAuthorize("hasAnyRole('PARENT', 'ADMIN', 'SUPER_ADMIN')")
public class PaymentGatewayController {

    private final RazorpayService razorpayService;

    public PaymentGatewayController(RazorpayService razorpayService) {
        this.razorpayService = razorpayService;
    }

    // ===== Request/Response Records =====

    record CreateOrderRequest(
            UUID invoiceId,
            BigDecimal amount,
            String studentName,
            String description) {
    }

    record VerifyPaymentRequest(
            UUID invoiceId,
            String razorpayOrderId,
            String razorpayPaymentId,
            String razorpaySignature,
            BigDecimal amount) {
    }

    // ===== API Endpoints =====

    /**
     * Create a Razorpay order for payment
     */
    @PostMapping("/orders")
    public ApiResponse<Map<String, Object>> createOrder(
            @RequestBody CreateOrderRequest request) {
        Map<String, Object> order = razorpayService.createOrder(
                request.invoiceId(),
                request.amount(),
                request.studentName(),
                request.description());

        if ((boolean) order.getOrDefault("success", false)) {
            return ApiResponse.ok(order);
        } else {
            return ApiResponse.error("PAYMENT_ORDER_FAILED", "Failed to create payment order: " + order.get("error"));
        }
    }

    /**
     * Verify payment after Razorpay checkout
     */
    @PostMapping("/verify")
    public ApiResponse<Map<String, Object>> verifyPayment(
            @RequestBody VerifyPaymentRequest request) {
        // Verify signature
        boolean isValid = razorpayService.verifyPaymentSignature(
                request.razorpayOrderId(),
                request.razorpayPaymentId(),
                request.razorpaySignature());

        if (!isValid) {
            return ApiResponse.error("SIGNATURE_INVALID", "Payment verification failed: Invalid signature");
        }

        // Record the payment
        Map<String, Object> payment = razorpayService.recordPayment(
                request.invoiceId(),
                request.razorpayOrderId(),
                request.razorpayPaymentId(),
                request.amount());

        return ApiResponse.ok(payment);
    }

    /**
     * Get payment history for current user's children
     */
    @GetMapping("/history")
    public ApiResponse<List<Map<String, Object>>> getPaymentHistory(
            @RequestParam(required = false) UUID studentId) {
        // TODO: Get student ID from authenticated parent's children
        UUID effectiveStudentId = studentId != null ? studentId : UUID.randomUUID();

        List<Map<String, Object>> history = razorpayService.getPaymentHistory(effectiveStudentId);
        return ApiResponse.ok(history);
    }

    /**
     * Get Razorpay configuration (public key for frontend)
     */
    @GetMapping("/config")
    public ApiResponse<Map<String, Object>> getPaymentConfig() {
        // Only return public config, never the secret key
        return ApiResponse.ok(Map.of(
                "keyId", "rzp_test_dummy", // This would come from config
                "currency", "INR",
                "name", "School SIS",
                "description", "Fee Payment",
                "theme", Map.of("color", "#10b981")));
    }
}
