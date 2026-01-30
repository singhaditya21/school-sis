package com.schoolsis.fees.api.v1;

import com.schoolsis.fees.application.RazorpayService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for PaymentGatewayController endpoints.
 */
@WebMvcTest(PaymentGatewayController.class)
@DisplayName("Payment Gateway Controller Tests")
class PaymentGatewayControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private RazorpayService razorpayService;

    @Nested
    @DisplayName("POST /api/v1/payments/orders")
    class CreateOrder {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P008: Should create order successfully")
        void shouldCreateOrderSuccessfully() throws Exception {
            // Arrange
            Map<String, Object> mockOrder = Map.of(
                    "success", true,
                    "orderId", "order_12345",
                    "amount", 4500000,
                    "currency", "INR",
                    "keyId", "rzp_test_dummy");
            when(razorpayService.createOrder(any(), any(), any(), any()))
                    .thenReturn(mockOrder);

            String requestJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 45000,
                        "studentName": "Aarav Sharma",
                        "description": "Term 3 Tuition Fee"
                    }
                    """;

            // Act & Assert
            mockMvc.perform(post("/api/v1/payments/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.orderId").value("order_12345"))
                    .andExpect(jsonPath("$.data.amount").value(4500000))
                    .andExpect(jsonPath("$.data.currency").value("INR"));
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P009: Should return error on service failure")
        void shouldReturnErrorOnServiceFailure() throws Exception {
            // Arrange
            Map<String, Object> failedOrder = Map.of(
                    "success", false,
                    "error", "Razorpay API error");
            when(razorpayService.createOrder(any(), any(), any(), any()))
                    .thenReturn(failedOrder);

            String requestJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 45000,
                        "studentName": "Aarav Sharma",
                        "description": "Fee Payment"
                    }
                    """;

            // Act & Assert
            mockMvc.perform(post("/api/v1/payments/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(false))
                    .andExpect(jsonPath("$.error.code").value("PAYMENT_ORDER_FAILED"));
        }

        @Test
        @WithMockUser(roles = "STUDENT")
        @DisplayName("TC-P022: Should deny STUDENT access")
        void shouldDenyStudentAccess() throws Exception {
            String requestJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 45000,
                        "studentName": "Test",
                        "description": "Test"
                    }
                    """;

            mockMvc.perform(post("/api/v1/payments/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/payments/verify")
    class VerifyPayment {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P010: Should verify valid payment")
        void shouldVerifyValidPayment() throws Exception {
            // Arrange
            when(razorpayService.verifyPaymentSignature(any(), any(), any()))
                    .thenReturn(true);
            when(razorpayService.recordPayment(any(), any(), any(), any()))
                    .thenReturn(Map.of(
                            "success", true,
                            "paymentId", "pay_12345",
                            "status", "COMPLETED"));

            String requestJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "razorpayOrderId": "order_12345",
                        "razorpayPaymentId": "pay_12345",
                        "razorpaySignature": "valid_signature",
                        "amount": 45000
                    }
                    """;

            // Act & Assert
            mockMvc.perform(post("/api/v1/payments/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.status").value("COMPLETED"));
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P011: Should reject invalid signature")
        void shouldRejectInvalidSignature() throws Exception {
            // Arrange
            when(razorpayService.verifyPaymentSignature(any(), any(), any()))
                    .thenReturn(false);

            String requestJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "razorpayOrderId": "order_12345",
                        "razorpayPaymentId": "pay_12345",
                        "razorpaySignature": "invalid_signature",
                        "amount": 45000
                    }
                    """;

            // Act & Assert
            mockMvc.perform(post("/api/v1/payments/verify")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(false))
                    .andExpect(jsonPath("$.error.code").value("SIGNATURE_INVALID"));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/payments/config")
    class GetPaymentConfig {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P012: Should return public config only")
        void shouldReturnPublicConfigOnly() throws Exception {
            mockMvc.perform(get("/api/v1/payments/config"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.keyId").exists())
                    .andExpect(jsonPath("$.data.currency").value("INR"))
                    .andExpect(jsonPath("$.data.name").value("School SIS"))
                    // Ensure secret is NOT included
                    .andExpect(jsonPath("$.data.keySecret").doesNotExist());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/payments/history")
    class GetPaymentHistory {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-P007: Should return payment history")
        void shouldReturnPaymentHistory() throws Exception {
            mockMvc.perform(get("/api/v1/payments/history"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should filter by student ID")
        void shouldFilterByStudentId() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/payments/history")
                    .param("studentId", studentId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }
    }

    @Nested
    @DisplayName("Role-Based Access Control")
    class RoleBasedAccess {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-P021: ADMIN should have access")
        void adminShouldHaveAccess() throws Exception {
            mockMvc.perform(get("/api/v1/payments/config"))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "SUPER_ADMIN")
        @DisplayName("SUPER_ADMIN should have access")
        void superAdminShouldHaveAccess() throws Exception {
            mockMvc.perform(get("/api/v1/payments/config"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("Unauthenticated should be denied")
        void unauthenticatedShouldBeDenied() throws Exception {
            mockMvc.perform(get("/api/v1/payments/config"))
                    .andExpect(status().isUnauthorized());
        }
    }
}
