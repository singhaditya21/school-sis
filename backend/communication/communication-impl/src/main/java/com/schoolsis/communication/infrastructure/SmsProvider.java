package com.schoolsis.communication.infrastructure;

/**
 * SMS Provider interface for abstracting different SMS gateways.
 */
public interface SmsProvider {

    /**
     * Send SMS message.
     * 
     * @return Message ID from provider
     */
    String sendSms(String phoneNumber, String message, String senderId);

    /**
     * Check delivery status.
     */
    DeliveryStatus getDeliveryStatus(String messageId);

    /**
     * Get provider name for logging.
     */
    String getProviderName();

    enum DeliveryStatus {
        PENDING, SENT, DELIVERED, FAILED, UNKNOWN
    }
}
