package com.schoolsis.communication.infrastructure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Gupshup WhatsApp Provider implementation.
 * Leading WhatsApp Business API provider in India.
 * 
 * Configure via application.yml:
 * gupshup:
 * api-key: your-api-key
 * source-mobile: your-registered-mobile
 * app-name: your-app-name
 */
@Component
public class GupshupWhatsAppProvider {

    private static final Logger log = LoggerFactory.getLogger(GupshupWhatsAppProvider.class);

    private static final String GUPSHUP_API_URL = "https://api.gupshup.io/sm/api/v1/msg";

    @Value("${gupshup.api-key:}")
    private String apiKey;

    @Value("${gupshup.source-mobile:}")
    private String sourceMobile;

    @Value("${gupshup.app-name:}")
    private String appName;

    @Value("${gupshup.enabled:false}")
    private boolean enabled;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Send WhatsApp message.
     */
    @SuppressWarnings("unchecked") // RestTemplate generic type erasure
    public String sendWhatsApp(String phoneNumber, String message) {
        if (!enabled || apiKey.isEmpty()) {
            log.info("[GUPSHUP MOCK] Would send WhatsApp to {}: {}", phoneNumber, truncate(message, 50));
            return "MOCK_WA_" + System.currentTimeMillis();
        }

        try {
            String formattedPhone = formatPhoneNumber(phoneNumber);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            headers.set("apikey", apiKey);

            String body = String.format(
                    "channel=whatsapp&source=%s&destination=%s&message=%s&src.name=%s",
                    sourceMobile,
                    formattedPhone,
                    java.net.URLEncoder.encode(message, "UTF-8"),
                    appName);

            HttpEntity<String> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    GUPSHUP_API_URL,
                    request,
                    (Class<Map<String, Object>>) (Class<?>) Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String messageId = (String) response.getBody().get("messageId");
                log.info("[GUPSHUP] WhatsApp sent to {}, messageId: {}", formattedPhone, messageId);
                return messageId;
            } else {
                log.error("[GUPSHUP] Failed to send WhatsApp: {}", response.getBody());
                return null;
            }
        } catch (Exception e) {
            log.error("[GUPSHUP] Error sending WhatsApp to {}: {}", phoneNumber, e.getMessage());
            return null;
        }
    }

    /**
     * Send WhatsApp template message (for transactional messages).
     */
    @SuppressWarnings("unchecked") // RestTemplate generic type erasure
    public String sendTemplateMessage(String phoneNumber, String templateId, Map<String, String> params) {
        if (!enabled || apiKey.isEmpty()) {
            log.info("[GUPSHUP MOCK] Would send template {} to {}", templateId, phoneNumber);
            return "MOCK_TEMPLATE_" + System.currentTimeMillis();
        }

        try {
            String formattedPhone = formatPhoneNumber(phoneNumber);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("apikey", apiKey);

            Map<String, Object> templateBody = new HashMap<>();
            templateBody.put("id", templateId);
            templateBody.put("params", params.values().toArray(new String[0]));

            Map<String, Object> body = new HashMap<>();
            body.put("channel", "whatsapp");
            body.put("source", sourceMobile);
            body.put("destination", formattedPhone);
            body.put("template", templateBody);
            body.put("src.name", appName);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    GUPSHUP_API_URL,
                    request,
                    (Class<Map<String, Object>>) (Class<?>) Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String messageId = (String) response.getBody().get("messageId");
                log.info("[GUPSHUP] Template message sent to {}, messageId: {}", formattedPhone, messageId);
                return messageId;
            }
        } catch (Exception e) {
            log.error("[GUPSHUP] Error sending template to {}: {}", phoneNumber, e.getMessage());
        }

        return null;
    }

    public String getProviderName() {
        return "Gupshup";
    }

    private String formatPhoneNumber(String phone) {
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("91") && digits.length() == 12) {
            return digits;
        }
        if (digits.length() == 10) {
            return "91" + digits;
        }
        return digits;
    }

    private String truncate(String text, int maxLength) {
        return text.length() <= maxLength ? text : text.substring(0, maxLength) + "...";
    }
}
