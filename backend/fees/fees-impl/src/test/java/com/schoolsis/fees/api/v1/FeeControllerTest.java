package com.schoolsis.fees.api.v1;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for FeeController endpoints.
 */
@WebMvcTest(FeeController.class)
@DisplayName("Fee Controller Tests")
class FeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/fees/structures")
    class CreateFeeStructure {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-FEE-001: Should create fee structure")
        void shouldCreateFeeStructure() throws Exception {
            String structureJson = """
                    {
                        "name": "Class 10 Annual Fees 2026-27",
                        "classIds": ["550e8400-e29b-41d4-a716-446655440000"],
                        "academicYear": "2026-27",
                        "components": [
                            {"name": "Tuition Fee", "amount": 50000, "frequency": "ANNUAL"},
                            {"name": "Lab Fee", "amount": 5000, "frequency": "ONE_TIME"},
                            {"name": "Bus Fee", "amount": 24000, "frequency": "ANNUAL", "optional": true}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/structures")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(structureJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.totalAmount").value(55000));
        }

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should allow ACCOUNTANT to create")
        void shouldAllowAccountant() throws Exception {
            String structureJson = """
                    {
                        "name": "Test Structure",
                        "classIds": ["550e8400-e29b-41d4-a716-446655440000"],
                        "academicYear": "2026-27",
                        "components": [{"name": "Fee", "amount": 1000, "frequency": "ANNUAL"}]
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/structures")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(structureJson))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/fees/invoices/generate")
    class GenerateInvoices {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-FEE-002: Should generate invoices for class")
        void shouldGenerateInvoices() throws Exception {
            String generateJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "feeStructureId": "660e8400-e29b-41d4-a716-446655440000",
                        "term": "TERM_1",
                        "dueDate": "2026-04-30"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/invoices/generate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(generateJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.generatedCount").isNumber())
                    .andExpect(jsonPath("$.data.totalAmount").isNumber());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/fees/invoices")
    class GetInvoices {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-FEE-003: Should get invoices by student")
        void shouldGetInvoicesByStudent() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/fees/invoices")
                    .param("studentId", studentId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].invoiceNumber").exists())
                    .andExpect(jsonPath("$.data[0].amount").isNumber())
                    .andExpect(jsonPath("$.data[0].status").exists());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should allow PARENT to view child invoices")
        void shouldAllowParentView() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/fees/invoices")
                    .param("studentId", studentId.toString()))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/fees/payments")
    class RecordPayment {

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("TC-FEE-004: Should record manual payment")
        void shouldRecordManualPayment() throws Exception {
            String paymentJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 25000,
                        "mode": "CASH",
                        "reference": "Receipt #12345",
                        "date": "2026-01-28"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(paymentJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.paymentId").exists())
                    .andExpect(jsonPath("$.data.receiptNumber").exists())
                    .andExpect(jsonPath("$.data.remainingBalance").isNumber());
        }

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should update invoice status to PARTIAL")
        void shouldUpdateToPartial() throws Exception {
            String paymentJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 10000,
                        "mode": "UPI",
                        "reference": "UPI12345"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(paymentJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.invoiceStatus").value("PARTIAL"));
        }

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should update invoice status to PAID when full payment")
        void shouldUpdateToPaidWhenFull() throws Exception {
            String paymentJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 50000,
                        "mode": "CHEQUE",
                        "reference": "CHQ001234"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(paymentJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.invoiceStatus").value("PAID"));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/fees/concessions")
    class ApplyConcession {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-FEE-005: Should apply concession")
        void shouldApplyConcession() throws Exception {
            String concessionJson = """
                    {
                        "studentId": "550e8400-e29b-41d4-a716-446655440000",
                        "type": "SCHOLARSHIP",
                        "amount": 10000,
                        "reason": "Academic Excellence Award"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/concessions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(concessionJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.concessionId").exists())
                    .andExpect(jsonPath("$.data.adjustedAmount").isNumber());
        }

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should deny ACCOUNTANT from applying concessions")
        void shouldDenyAccountant() throws Exception {
            String concessionJson = """
                    {
                        "studentId": "550e8400-e29b-41d4-a716-446655440000",
                        "type": "STAFF",
                        "amount": 5000
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/concessions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(concessionJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("Sibling Discount")
    class SiblingDiscount {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-FEE-006: Should auto-apply sibling discount")
        void shouldAutoApplySiblingDiscount() throws Exception {
            // When generating invoice for a student who has a sibling
            String generateJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentId": "sibling-student-id",
                        "feeStructureId": "660e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/invoices/generate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(generateJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.discounts[?(@.type=='SIBLING')]").exists())
                    .andExpect(jsonPath("$.data.discounts[?(@.type=='SIBLING')].percentage").value(10));
        }
    }

    @Nested
    @DisplayName("Late Fee Calculation")
    class LateFeeCalculation {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should calculate late fee for overdue invoices")
        void shouldCalculateLateFee() throws Exception {
            // Invoice with due date in the past
            UUID invoiceId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/fees/invoices/{invoiceId}", invoiceId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.lateFee").isNumber())
                    .andExpect(jsonPath("$.data.totalDue").isNumber());
        }
    }

    @Nested
    @DisplayName("Receipt Generation")
    class ReceiptGeneration {

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should generate receipt PDF")
        void shouldGenerateReceiptPdf() throws Exception {
            UUID paymentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/fees/payments/{paymentId}/receipt", paymentId))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType(MediaType.APPLICATION_PDF));
        }
    }

    @Nested
    @DisplayName("Fee Reports")
    class FeeReports {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should get collection report")
        void shouldGetCollectionReport() throws Exception {
            mockMvc.perform(get("/api/v1/fees/reports/collection")
                    .param("startDate", "2026-01-01")
                    .param("endDate", "2026-01-31"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.totalCollected").isNumber())
                    .andExpect(jsonPath("$.data.pendingAmount").isNumber())
                    .andExpect(jsonPath("$.data.collectionPercentage").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should get class-wise collection")
        void shouldGetClassWiseCollection() throws Exception {
            mockMvc.perform(get("/api/v1/fees/reports/by-class"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].className").exists())
                    .andExpect(jsonPath("$.data[0].collectionPercentage").isNumber());
        }
    }

    @Nested
    @DisplayName("Validity Checks")
    class ValidityChecks {

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should reject payment exceeding invoice amount")
        void shouldRejectExcessPayment() throws Exception {
            String paymentJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 999999,
                        "mode": "CASH"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(paymentJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(containsString("exceeds")));
        }

        @Test
        @WithMockUser(roles = "ACCOUNTANT")
        @DisplayName("Should reject zero or negative payment")
        void shouldRejectInvalidAmount() throws Exception {
            String paymentJson = """
                    {
                        "invoiceId": "550e8400-e29b-41d4-a716-446655440000",
                        "amount": 0,
                        "mode": "CASH"
                    }
                    """;

            mockMvc.perform(post("/api/v1/fees/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(paymentJson))
                    .andExpect(status().isBadRequest());
        }
    }
}
