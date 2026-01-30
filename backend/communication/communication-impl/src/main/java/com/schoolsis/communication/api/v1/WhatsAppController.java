package com.schoolsis.communication.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.communication.application.CommunicationService;
import com.schoolsis.communication.domain.model.MessageChannel;
import com.schoolsis.communication.infrastructure.GupshupWhatsAppProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

/**
 * WhatsApp-specific API endpoints for enhanced messaging features.
 * Provides bulk messaging, template messages, and webhook handling for delivery
 * status.
 */
@RestController
@RequestMapping("/api/v1/whatsapp")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
public class WhatsAppController {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppController.class);

    private final GupshupWhatsAppProvider whatsAppProvider;
    private final CommunicationService communicationService;

    public WhatsAppController(GupshupWhatsAppProvider whatsAppProvider, CommunicationService communicationService) {
        this.whatsAppProvider = whatsAppProvider;
        this.communicationService = communicationService;
    }

    /**
     * Send a single WhatsApp message directly (bypasses consent check for admin
     * use).
     */
    @PostMapping("/send")
    public ApiResponse<SendResult> sendMessage(@Valid @RequestBody SendWhatsAppRequest request) {
        String messageId = whatsAppProvider.sendWhatsApp(request.phoneNumber(), request.message());
        return ApiResponse.ok(new SendResult(messageId, messageId != null ? "SENT" : "FAILED"));
    }

    /**
     * Send WhatsApp messages in bulk to multiple recipients.
     */
    @PostMapping("/bulk")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<BulkSendResult> sendBulkMessages(@Valid @RequestBody BulkWhatsAppRequest request) {
        List<CompletableFuture<SendResult>> futures = request.recipients().stream()
                .map(recipient -> CompletableFuture.supplyAsync(() -> {
                    String messageId = whatsAppProvider.sendWhatsApp(recipient.phoneNumber(), request.message());
                    return new SendResult(messageId, messageId != null ? "SENT" : "FAILED");
                }))
                .collect(Collectors.toList());

        // Collect results
        List<SendResult> results = futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());

        long successCount = results.stream().filter(r -> "SENT".equals(r.status())).count();
        long failCount = results.size() - successCount;

        return ApiResponse.ok(new BulkSendResult(
                results.size(),
                (int) successCount,
                (int) failCount,
                results));
    }

    /**
     * Send a template-based WhatsApp message for transactional use cases.
     */
    @PostMapping("/template")
    public ApiResponse<SendResult> sendTemplateMessage(@Valid @RequestBody TemplateMessageRequest request) {
        String messageId = whatsAppProvider.sendTemplateMessage(
                request.phoneNumber(),
                request.templateId(),
                request.params());
        return ApiResponse.ok(new SendResult(messageId, messageId != null ? "SENT" : "FAILED"));
    }

    /**
     * Send fee reminder via WhatsApp to a parent.
     */
    @PostMapping("/fee-reminder")
    public ApiResponse<SendResult> sendFeeReminder(@Valid @RequestBody FeeReminderRequest request) {
        String message = String.format(
                "Dear Parent,\n\n" +
                        "This is a reminder that fees of ₹%.2f are pending for %s (Class %s).\n\n" +
                        "Due Date: %s\n\n" +
                        "Please pay at your earliest convenience.\n\n" +
                        "Thank you,\nSchool Administration",
                request.amount(),
                request.studentName(),
                request.className(),
                request.dueDate());

        String messageId = whatsAppProvider.sendWhatsApp(request.phoneNumber(), message);
        return ApiResponse.ok(new SendResult(messageId, messageId != null ? "SENT" : "FAILED"));
    }

    /**
     * Send attendance notification via WhatsApp to a parent.
     */
    @PostMapping("/attendance-alert")
    public ApiResponse<SendResult> sendAttendanceAlert(@Valid @RequestBody AttendanceAlertRequest request) {
        String message = String.format(
                "Dear Parent,\n\n" +
                        "%s (Class %s) has been marked %s on %s.\n\n" +
                        "Thank you,\nSchool Administration",
                request.studentName(),
                request.className(),
                request.status(),
                request.date());

        String messageId = whatsAppProvider.sendWhatsApp(request.phoneNumber(), message);
        return ApiResponse.ok(new SendResult(messageId, messageId != null ? "SENT" : "FAILED"));
    }

    /**
     * Webhook endpoint for Gupshup delivery status callbacks.
     * This endpoint should be publicly accessible (no auth).
     */
    @PostMapping("/webhook")
    @PreAuthorize("permitAll()")
    public ApiResponse<String> handleWebhook(@RequestBody Map<String, Object> payload) {
        log.info("Received WhatsApp webhook: {}", payload);

        String eventType = (String) payload.get("type");
        String messageId = (String) payload.get("messageId");
        String status = (String) payload.get("status");

        if ("message-event".equals(eventType) && messageId != null && status != null) {
            log.info("WhatsApp message {} status: {}", messageId, status);
            // TODO: Update MessageLog status based on webhook
        }

        return ApiResponse.ok("Webhook received");
    }

    // Request/Response DTOs
    public record SendWhatsAppRequest(
            @NotBlank String phoneNumber,
            @NotBlank String message) {
    }

    public record BulkWhatsAppRequest(
            @NotEmpty List<Recipient> recipients,
            @NotBlank String message) {
    }

    public record Recipient(
            @NotBlank String phoneNumber,
            String name) {
    }

    public record TemplateMessageRequest(
            @NotBlank String phoneNumber,
            @NotBlank String templateId,
            @NotNull Map<String, String> params) {
    }

    public record FeeReminderRequest(
            @NotBlank String phoneNumber,
            @NotBlank String studentName,
            @NotBlank String className,
            @NotNull Double amount,
            @NotBlank String dueDate) {
    }

    public record AttendanceAlertRequest(
            @NotBlank String phoneNumber,
            @NotBlank String studentName,
            @NotBlank String className,
            @NotBlank String status,
            @NotBlank String date) {
    }

    public record SendResult(String messageId, String status) {
    }

    public record BulkSendResult(
            int totalRecipients,
            int successCount,
            int failCount,
            List<SendResult> results) {
    }
}
