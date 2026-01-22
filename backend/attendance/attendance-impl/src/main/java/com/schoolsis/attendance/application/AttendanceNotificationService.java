package com.schoolsis.attendance.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Service for sending attendance notifications to parents.
 * Triggered when a student is marked absent.
 */
@Service
public class AttendanceNotificationService {

    private static final Logger log = LoggerFactory.getLogger(AttendanceNotificationService.class);

    // In production, inject CommunicationService
    // private final CommunicationService communicationService;

    /**
     * Send absence notification to parent.
     */
    public void notifyParentOfAbsence(UUID tenantId, AbsenceNotification notification) {
        log.info("Sending absence notification for student {} to parent", notification.studentId());

        // Build message from template
        String message = buildAbsenceMessage(notification);

        // In production, call the communication service
        // communicationService.sendSms(tenantId, notification.parentPhone(), message);
        // communicationService.sendWhatsApp(tenantId, notification.parentPhone(),
        // message);

        log.info("Absence notification sent: {}", message);
    }

    /**
     * Send bulk notifications for all absences of the day.
     */
    public void sendDailyAbsenceNotifications(UUID tenantId, List<AbsenceNotification> absences) {
        log.info("Sending {} absence notifications for tenant {}", absences.size(), tenantId);

        for (AbsenceNotification absence : absences) {
            try {
                notifyParentOfAbsence(tenantId, absence);
            } catch (Exception e) {
                log.error("Failed to send notification for student {}: {}",
                        absence.studentId(), e.getMessage());
            }
        }
    }

    /**
     * Build notification message from template.
     */
    private String buildAbsenceMessage(AbsenceNotification notification) {
        return String.format(
                "Dear Parent, Your ward %s (Class %s) was marked %s on %s. " +
                        "Reason: %s. For queries, contact the school office. - %s",
                notification.studentName(),
                notification.className(),
                notification.status().toLowerCase(),
                notification.date().toString(),
                notification.reason() != null ? notification.reason() : "Not specified",
                notification.schoolName());
    }

    /**
     * Check if notification should be sent based on settings.
     */
    public boolean shouldNotify(UUID tenantId, String attendanceStatus) {
        // In production, check tenant notification settings
        // Only notify for ABSENT and LATE statuses
        return "ABSENT".equalsIgnoreCase(attendanceStatus) ||
                "LATE".equalsIgnoreCase(attendanceStatus);
    }

    // DTOs
    public record AbsenceNotification(
            UUID studentId,
            String studentName,
            String className,
            String parentPhone,
            String parentEmail,
            LocalDate date,
            String status,
            String reason,
            String schoolName) {
    }

    public record NotificationResult(
            UUID studentId,
            boolean smsDelivered,
            boolean whatsappDelivered,
            boolean emailDelivered,
            String errorMessage) {
    }
}
