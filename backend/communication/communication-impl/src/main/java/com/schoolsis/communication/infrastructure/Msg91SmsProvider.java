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
 * MSG91 SMS Provider implementation.
 * India's leading transactional SMS gateway.
 * 
 * Configure via application.yml:
 * msg91:
 * auth-key: your-auth-key
 * sender-id: SCHOOLSIS
 * route: 4 # Transactional route
 */
@Component
public class Msg91SmsProvider implements SmsProvider {

    private static final Logger log = LoggerFactory.getLogger(Msg91SmsProvider.class);

    @SuppressWarnings("unused") // Used in production configuration
    private static final String MSG91_API_URL = "https://api.msg91.com/api/v5/flow/";

    @Value("${msg91.auth-key:}")
    private String authKey;

    @Value("${msg91.sender-id:SCHLSS}")
    private String defaultSenderId;

    @Value("${msg91.route:4}")
    private String route;

    @Value("${msg91.enabled:false}")
    private boolean enabled;

    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    @SuppressWarnings("unchecked") // RestTemplate generic type erasure
    public String sendSms(String phoneNumber, String message, String senderId) {
        if (!enabled || authKey.isEmpty()) {
            log.info("[MSG91 MOCK] Would send SMS to {}: {}", phoneNumber, message);
            return "MOCK_" + System.currentTimeMillis();
        }

        try {
            // Format phone number (add 91 prefix for India if not present)
            String formattedPhone = formatPhoneNumber(phoneNumber);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("authkey", authKey);

            Map<String, Object> body = new HashMap<>();
            body.put("sender", senderId != null ? senderId : defaultSenderId);
            body.put("route", route);
            body.put("country", "91");
            body.put("sms", new Object[] {
                    Map.of(
                            "message", message,
                            "to", new String[] { formattedPhone })
            });

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.postForEntity(
                    "https://api.msg91.com/api/v2/sendsms",
                    request,
                    (Class<Map<String, Object>>) (Class<?>) Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String requestId = (String) response.getBody().get("request_id");
                log.info("[MSG91] SMS sent successfully to {}, request_id: {}", formattedPhone, requestId);
                return requestId;
            } else {
                log.error("[MSG91] Failed to send SMS: {}", response.getBody());
                return null;
            }
        } catch (Exception e) {
            log.error("[MSG91] Error sending SMS to {}: {}", phoneNumber, e.getMessage());
            return null;
        }
    }

    @Override
    @SuppressWarnings("unchecked") // RestTemplate generic type erasure
    public DeliveryStatus getDeliveryStatus(String messageId) {
        if (!enabled || authKey.isEmpty()) {
            return DeliveryStatus.DELIVERED; // Mock always delivered
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("authkey", authKey);

            HttpEntity<Void> request = new HttpEntity<>(headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    "https://api.msg91.com/api/v5/report?request_id=" + messageId,
                    HttpMethod.GET,
                    request,
                    (Class<Map<String, Object>>) (Class<?>) Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                String status = (String) response.getBody().get("status");
                return mapStatus(status);
            }
        } catch (Exception e) {
            log.error("[MSG91] Error checking delivery status: {}", e.getMessage());
        }

        return DeliveryStatus.UNKNOWN;
    }

    @Override
    public String getProviderName() {
        return "MSG91";
    }

    private String formatPhoneNumber(String phone) {
        // Remove any non-digit characters
        String digits = phone.replaceAll("[^0-9]", "");

        // If starts with 91 and is 12 digits, it's already formatted
        if (digits.startsWith("91") && digits.length() == 12) {
            return digits;
        }

        // If 10 digits, add 91 prefix
        if (digits.length() == 10) {
            return "91" + digits;
        }

        return digits;
    }

    private DeliveryStatus mapStatus(String msg91Status) {
        if (msg91Status == null)
            return DeliveryStatus.UNKNOWN;

        return switch (msg91Status.toUpperCase()) {
            case "DELIVERED", "1" -> DeliveryStatus.DELIVERED;
            case "SENT", "SUCCESS" -> DeliveryStatus.SENT;
            case "PENDING", "QUEUED" -> DeliveryStatus.PENDING;
            case "FAILED", "REJECTED", "BLOCKED" -> DeliveryStatus.FAILED;
            default -> DeliveryStatus.UNKNOWN;
        };
    }
}
