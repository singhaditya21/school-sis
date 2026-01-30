package com.schoolsis.fees.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Service for Razorpay payment gateway integration.
 * Handles order creation, payment verification, and webhook processing.
 */
@Service
public class RazorpayService {

    @Value("${razorpay.key.id:rzp_test_dummy}")
    private String keyId;

    @Value("${razorpay.key.secret:dummy_secret}")
    private String keySecret;

    @Value("${razorpay.enabled:false}")
    private boolean enabled;

    /**
     * Creates a Razorpay order for the given invoice.
     * 
     * @param invoiceId   The invoice ID
     * @param amount      Amount in INR (will be converted to paise)
     * @param studentName Student name for receipt
     * @param description Payment description
     * @return Map containing order details
     */
    public Map<String, Object> createOrder(
            UUID invoiceId,
            BigDecimal amount,
            String studentName,
            String description) {
        Map<String, Object> result = new HashMap<>();

        if (!enabled) {
            // Return mock order for development/testing
            String mockOrderId = "order_" + UUID.randomUUID().toString().replace("-", "").substring(0, 14);
            result.put("success", true);
            result.put("orderId", mockOrderId);
            result.put("amount", amount.multiply(BigDecimal.valueOf(100)).intValue()); // Convert to paise
            result.put("currency", "INR");
            result.put("keyId", keyId);
            result.put("invoiceId", invoiceId.toString());
            result.put("prefill", Map.of(
                    "name", studentName,
                    "description", description));
            result.put("mock", true);
            return result;
        }

        try {
            // In production, use Razorpay SDK:
            // RazorpayClient razorpay = new RazorpayClient(keyId, keySecret);
            // JSONObject orderRequest = new JSONObject();
            // orderRequest.put("amount",
            // amount.multiply(BigDecimal.valueOf(100)).intValue());
            // orderRequest.put("currency", "INR");
            // orderRequest.put("receipt", invoiceId.toString());
            // Order order = razorpay.orders.create(orderRequest);

            // For now, return simulated response
            String orderId = "order_" + System.currentTimeMillis();
            result.put("success", true);
            result.put("orderId", orderId);
            result.put("amount", amount.multiply(BigDecimal.valueOf(100)).intValue());
            result.put("currency", "INR");
            result.put("keyId", keyId);
            result.put("invoiceId", invoiceId.toString());
            result.put("prefill", Map.of(
                    "name", studentName,
                    "description", description));

        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }

        return result;
    }

    /**
     * Verifies the payment signature from Razorpay callback.
     * 
     * @param orderId   Razorpay order ID
     * @param paymentId Razorpay payment ID
     * @param signature Razorpay signature
     * @return true if signature is valid
     */
    public boolean verifyPaymentSignature(String orderId, String paymentId, String signature) {
        if (!enabled) {
            // Accept all signatures in mock mode
            return true;
        }

        try {
            String data = orderId + "|" + paymentId;
            String generatedSignature = hmacSha256(data, keySecret);
            return generatedSignature.equals(signature);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Records a successful payment.
     * 
     * @param invoiceId Invoice ID
     * @param orderId   Razorpay order ID
     * @param paymentId Razorpay payment ID
     * @param amount    Amount paid
     * @return Payment record details
     */
    public Map<String, Object> recordPayment(
            UUID invoiceId,
            String orderId,
            String paymentId,
            BigDecimal amount) {
        // TODO: Save payment to database
        // TODO: Update invoice status to PAID
        // TODO: Send payment confirmation email/SMS

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("paymentId", paymentId);
        result.put("invoiceId", invoiceId.toString());
        result.put("amount", amount);
        result.put("status", "COMPLETED");
        result.put("timestamp", java.time.Instant.now().toString());
        result.put("receiptNumber", "REC-" + System.currentTimeMillis());

        return result;
    }

    /**
     * Gets payment history for a student/parent.
     * 
     * @param studentId Student ID
     * @return List of payment records
     */
    public java.util.List<Map<String, Object>> getPaymentHistory(UUID studentId) {
        // TODO: Fetch from database
        // For now, return mock data
        return java.util.List.of(
                Map.of(
                        "id", UUID.randomUUID().toString(),
                        "invoiceNumber", "INV-2025-0089",
                        "amount", 35000,
                        "paymentDate", "2025-12-15",
                        "paymentMethod", "Razorpay",
                        "status", "SUCCESS",
                        "receiptNumber", "REC-1703001234567"),
                Map.of(
                        "id", UUID.randomUUID().toString(),
                        "invoiceNumber", "INV-2025-0045",
                        "amount", 42000,
                        "paymentDate", "2025-09-10",
                        "paymentMethod", "Razorpay",
                        "status", "SUCCESS",
                        "receiptNumber", "REC-1694234567890"));
    }

    private String hmacSha256(String data, String secret) throws NoSuchAlgorithmException, InvalidKeyException {
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(), "HmacSHA256");
        mac.init(secretKeySpec);
        byte[] hash = mac.doFinal(data.getBytes());
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1)
                hexString.append('0');
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
