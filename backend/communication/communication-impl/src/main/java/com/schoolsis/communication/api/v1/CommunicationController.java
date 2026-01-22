package com.schoolsis.communication.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.communication.application.CommunicationService;
import com.schoolsis.communication.application.CommunicationService.*;
import com.schoolsis.communication.domain.model.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/communication")
public class CommunicationController {

    private final CommunicationService communicationService;

    public CommunicationController(CommunicationService communicationService) {
        this.communicationService = communicationService;
    }

    @GetMapping("/templates")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<List<TemplateResponse>> getTemplates() {
        return ApiResponse.ok(communicationService.getTemplates().stream()
            .map(t -> new TemplateResponse(t.getId(), t.getName(), t.getSubject(), t.getBody(), t.getChannel())).toList());
    }

    @PostMapping("/templates")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
    public ApiResponse<TemplateResponse> createTemplate(@Valid @RequestBody CreateTemplateRequest req) {
        MessageTemplate t = communicationService.createTemplate(new CreateTemplateCommand(req.name(), req.subject(), req.body(), req.channel()));
        return ApiResponse.ok(new TemplateResponse(t.getId(), t.getName(), t.getSubject(), t.getBody(), t.getChannel()));
    }

    @PostMapping("/send")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<String> sendMessage(@Valid @RequestBody SendMessageRequest req) {
        communicationService.sendMessage(new SendMessageCommand(req.channel(), req.recipientId(), req.recipientContact(), req.subject(), req.body()));
        return ApiResponse.ok("Message queued for delivery");
    }

    @PutMapping("/consent")
    @PreAuthorize("isAuthenticated()")
    public ApiResponse<String> updateConsent(@RequestBody UpdateConsentRequest req) {
        communicationService.updateConsent(req.userId(), req.channel(), req.consented());
        return ApiResponse.ok("Consent updated");
    }

    @GetMapping("/consent/{userId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN') or #userId == authentication.principal.userId")
    public ApiResponse<List<ConsentResponse>> getUserConsents(@PathVariable UUID userId) {
        return ApiResponse.ok(communicationService.getUserConsents(userId).stream()
            .map(c -> new ConsentResponse(c.getId(), c.getUserId(), c.getChannel(), c.isConsented(), c.getConsentedAt())).toList());
    }

    public record CreateTemplateRequest(@NotBlank String name, @NotBlank String subject, @NotBlank String body, @NotNull MessageChannel channel) {}
    public record SendMessageRequest(@NotNull MessageChannel channel, @NotNull UUID recipientId, @NotBlank String recipientContact, String subject, @NotBlank String body) {}
    public record UpdateConsentRequest(@NotNull UUID userId, @NotNull MessageChannel channel, boolean consented) {}
    public record TemplateResponse(UUID id, String name, String subject, String body, MessageChannel channel) {}
    public record ConsentResponse(UUID id, UUID userId, MessageChannel channel, boolean consented, Instant consentedAt) {}
}
