package com.schoolsis.communication.api.v1;

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
 * Unit tests for CommunicationController endpoints.
 */
@WebMvcTest(CommunicationController.class)
@DisplayName("Communication Controller Tests")
class CommunicationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/communication/sms")
    class SendSms {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-001: Should send SMS")
        void shouldSendSms() throws Exception {
            String smsJson = """
                    {
                        "recipients": ["9876543210", "9876543211"],
                        "templateId": "t1",
                        "variables": {
                            "studentName": "Aarav",
                            "date": "2026-01-28"
                        }
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/sms")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(smsJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.sentCount").value(2))
                    .andExpect(jsonPath("$.data.messageIds").isArray());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from sending bulk SMS")
        void shouldDenyTeacher() throws Exception {
            String smsJson = """
                    {
                        "recipients": ["9876543210"],
                        "templateId": "t1",
                        "variables": {}
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/sms")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(smsJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/communication/whatsapp")
    class SendWhatsApp {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-002: Should send WhatsApp message")
        void shouldSendWhatsApp() throws Exception {
            String waJson = """
                    {
                        "recipients": ["919876543210"],
                        "templateName": "fee_reminder",
                        "variables": {
                            "studentName": "Aarav",
                            "amount": "25000",
                            "dueDate": "2026-02-15"
                        }
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/whatsapp")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(waJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.provider").value("GUPSHUP"))
                    .andExpect(jsonPath("$.data.sentCount").value(1));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/communication/bulk")
    class SendBulkNotification {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-003: Should send bulk notification")
        void shouldSendBulkNotification() throws Exception {
            String bulkJson = """
                    {
                        "classIds": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "660e8400-e29b-41d4-a716-446655440000"
                        ],
                        "channel": "SMS",
                        "message": "School will remain closed tomorrow due to weather conditions."
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/bulk")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(bulkJson))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.data.jobId").exists())
                    .andExpect(jsonPath("$.data.totalRecipients").isNumber())
                    .andExpect(jsonPath("$.data.status").value("QUEUED"));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should support multiple channels")
        void shouldSupportMultipleChannels() throws Exception {
            String bulkJson = """
                    {
                        "classIds": ["550e8400-e29b-41d4-a716-446655440000"],
                        "channels": ["SMS", "WHATSAPP", "EMAIL"],
                        "message": "Important announcement"
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/bulk")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(bulkJson))
                    .andExpect(status().isAccepted());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/communication/templates")
    class CreateTemplate {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-004: Should create message template")
        void shouldCreateTemplate() throws Exception {
            String templateJson = """
                    {
                        "name": "absence_notification",
                        "channel": "SMS",
                        "content": "Dear Parent, {{studentName}} was marked absent on {{date}}. Please contact the school if needed.",
                        "variables": ["studentName", "date"]
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/templates")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(templateJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.name").value("absence_notification"));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should validate template variables")
        void shouldValidateVariables() throws Exception {
            String templateJson = """
                    {
                        "name": "test_template",
                        "channel": "SMS",
                        "content": "Hello {{name}}, your balance is {{amount}}",
                        "variables": ["name"]
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/templates")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(templateJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(containsString("amount")));
        }
    }

    @Nested
    @DisplayName("Consent Management")
    class ConsentManagement {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-005: Should skip if consent is false")
        void shouldSkipIfNoConsent() throws Exception {
            // Parent with SMS consent = false
            String smsJson = """
                    {
                        "recipients": ["9876543210"],
                        "templateId": "t1",
                        "variables": {},
                        "respectConsent": true
                    }
                    """;

            mockMvc.perform(post("/api/v1/communication/sms")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(smsJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.skippedCount").value(1))
                    .andExpect(jsonPath("$.data.skippedReason").value("NO_CONSENT"));
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should allow parent to update consent")
        void shouldAllowConsentUpdate() throws Exception {
            String consentJson = """
                    {
                        "sms": true,
                        "whatsapp": true,
                        "email": false,
                        "pushNotification": true
                    }
                    """;

            mockMvc.perform(put("/api/v1/communication/consent")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(consentJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.updated").value(true));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/communication/messages/{id}/status")
    class MessageStatus {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-COMM-006: Should return message delivery status")
        void shouldReturnDeliveryStatus() throws Exception {
            UUID messageId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/communication/messages/{id}/status", messageId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value(anyOf(
                            is("SENT"), is("DELIVERED"), is("FAILED"), is("PENDING"))))
                    .andExpect(jsonPath("$.data.sentAt").exists());
        }
    }

    @Nested
    @DisplayName("Template Listing")
    class TemplateListing {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should list templates by channel")
        void shouldListTemplatesByChannel() throws Exception {
            mockMvc.perform(get("/api/v1/communication/templates")
                    .param("channel", "SMS"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[*].channel").value(everyItem(is("SMS"))));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return template by ID")
        void shouldReturnTemplateById() throws Exception {
            UUID templateId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/communication/templates/{id}", templateId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.name").exists())
                    .andExpect(jsonPath("$.data.content").exists());
        }
    }

    @Nested
    @DisplayName("Message History")
    class MessageHistory {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return message history")
        void shouldReturnMessageHistory() throws Exception {
            mockMvc.perform(get("/api/v1/communication/messages")
                    .param("channel", "SMS")
                    .param("startDate", "2026-01-01")
                    .param("endDate", "2026-01-31"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.pagination.totalElements").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should filter by recipient")
        void shouldFilterByRecipient() throws Exception {
            mockMvc.perform(get("/api/v1/communication/messages")
                    .param("recipient", "9876543210"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[*].recipient").value(everyItem(is("9876543210"))));
        }
    }

    @Nested
    @DisplayName("Delivery Reports")
    class DeliveryReports {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return delivery statistics")
        void shouldReturnDeliveryStats() throws Exception {
            mockMvc.perform(get("/api/v1/communication/reports/delivery")
                    .param("startDate", "2026-01-01")
                    .param("endDate", "2026-01-31"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.totalSent").isNumber())
                    .andExpect(jsonPath("$.data.delivered").isNumber())
                    .andExpect(jsonPath("$.data.failed").isNumber())
                    .andExpect(jsonPath("$.data.deliveryRate").isNumber());
        }
    }

    @Nested
    @DisplayName("SMS Provider")
    class SmsProvider {

        @Test
        @WithMockUser(roles = "SUPER_ADMIN")
        @DisplayName("Should configure SMS provider")
        void shouldConfigureSmsProvider() throws Exception {
            String configJson = """
                    {
                        "provider": "MSG91",
                        "apiKey": "xxx-xxx-xxx",
                        "senderId": "SCHOOL"
                    }
                    """;

            mockMvc.perform(put("/api/v1/communication/config/sms")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(configJson))
                    .andExpect(status().isOk());
        }
    }
}
