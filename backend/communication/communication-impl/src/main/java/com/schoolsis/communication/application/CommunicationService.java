package com.schoolsis.communication.application;

import com.schoolsis.communication.domain.model.*;
import com.schoolsis.communication.domain.repository.*;
import com.schoolsis.communication.infrastructure.GupshupWhatsAppProvider;
import com.schoolsis.communication.infrastructure.Msg91SmsProvider;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class CommunicationService {

    private static final Logger log = LoggerFactory.getLogger(CommunicationService.class);

    private final MessageTemplateRepository templateRepository;
    private final MessageLogRepository messageLogRepository;
    private final ConsentRepository consentRepository;
    private final GupshupWhatsAppProvider whatsAppProvider;
    private final Msg91SmsProvider smsProvider;

    public CommunicationService(MessageTemplateRepository templateRepository, MessageLogRepository messageLogRepository,
            ConsentRepository consentRepository, GupshupWhatsAppProvider whatsAppProvider,
            Msg91SmsProvider smsProvider) {
        this.templateRepository = templateRepository;
        this.messageLogRepository = messageLogRepository;
        this.consentRepository = consentRepository;
        this.whatsAppProvider = whatsAppProvider;
        this.smsProvider = smsProvider;
    }

    @Transactional(readOnly = true)
    public List<MessageTemplate> getTemplates() {
        return templateRepository.findActiveByTenantId(TenantContext.getCurrentTenantId());
    }

    public MessageTemplate createTemplate(CreateTemplateCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        MessageTemplate t = new MessageTemplate();
        t.setTenantId(tenantId);
        t.setName(cmd.name());
        t.setSubject(cmd.subject());
        t.setBody(cmd.body());
        t.setChannel(cmd.channel());
        return templateRepository.save(t);
    }

    @Async
    public void sendMessage(SendMessageCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantIdOrNull();

        // Check consent
        var consent = consentRepository.findByUserIdAndChannel(cmd.recipientId(), cmd.channel());
        if (consent.isEmpty() || !consent.get().isConsented()) {
            log.warn("Consent not given for user {} channel {}", cmd.recipientId(), cmd.channel());
            return;
        }

        MessageLog msg = new MessageLog();
        msg.setTenantId(tenantId);
        msg.setChannel(cmd.channel());
        msg.setRecipientId(cmd.recipientId());
        msg.setRecipientContact(cmd.recipientContact());
        msg.setSubject(cmd.subject());
        msg.setBody(cmd.body());

        try {
            String messageId = null;
            switch (cmd.channel()) {
                case WHATSAPP:
                    messageId = whatsAppProvider.sendWhatsApp(cmd.recipientContact(), cmd.body());
                    break;
                case SMS:
                    messageId = smsProvider.sendSms(cmd.recipientContact(), cmd.body(), null);
                    break;
                case EMAIL:
                    // TODO: Implement email provider
                    log.info("Email sending not yet implemented");
                    messageId = "EMAIL_PLACEHOLDER_" + System.currentTimeMillis();
                    break;
            }
            log.info("Sent {} to {} with messageId: {}", cmd.channel(), cmd.recipientContact(), messageId);
            msg.setStatus(MessageStatus.SENT);
            msg.setSentAt(Instant.now());
            msg.setProviderMessageId(messageId);
        } catch (Exception e) {
            log.error("Failed to send {} to {}: {}", cmd.channel(), cmd.recipientContact(), e.getMessage());
            msg.setStatus(MessageStatus.FAILED);
            msg.setErrorMessage(e.getMessage());
        }

        messageLogRepository.save(msg);
    }

    public void updateConsent(UUID userId, MessageChannel channel, boolean consented) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        CommunicationConsent consent = consentRepository.findByUserIdAndChannel(userId, channel)
                .orElseGet(() -> {
                    CommunicationConsent c = new CommunicationConsent();
                    c.setTenantId(tenantId);
                    c.setUserId(userId);
                    c.setChannel(channel);
                    return c;
                });
        consent.setConsented(consented);
        if (consented) {
            consent.setConsentedAt(Instant.now());
            consent.setRevokedAt(null);
        } else {
            consent.setRevokedAt(Instant.now());
        }
        consentRepository.save(consent);
    }

    @Transactional(readOnly = true)
    public List<CommunicationConsent> getUserConsents(UUID userId) {
        return consentRepository.findActiveByUserId(userId);
    }

    public record CreateTemplateCommand(String name, String subject, String body, MessageChannel channel) {
    }

    public record SendMessageCommand(MessageChannel channel, UUID recipientId, String recipientContact, String subject,
            String body) {
    }
}
