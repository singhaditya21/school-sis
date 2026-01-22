package com.schoolsis.fees.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Defaulter Alert Service for automated fee reminder management.
 * Implements escalation rules and automated notifications.
 */
@Service
public class DefaulterAlertService {

    private static final Logger log = LoggerFactory.getLogger(DefaulterAlertService.class);

    // Escalation thresholds (days overdue)
    private static final int REMINDER_THRESHOLD = 7;
    private static final int WARNING_THRESHOLD = 15;
    private static final int ESCALATION_THRESHOLD = 30;
    private static final int CRITICAL_THRESHOLD = 60;

    /**
     * Scheduled job to process defaulters daily.
     */
    @Scheduled(cron = "0 0 9 * * *") // Run at 9 AM daily
    public void processDefaultersDaily() {
        log.info("Running daily defaulter processing job");
        // In production, iterate through all tenants
        // processDefaultersForTenant(tenantId);
    }

    /**
     * Process defaulters for a specific tenant.
     */
    public DefaulterProcessingResult processDefaultersForTenant(UUID tenantId) {
        log.info("Processing defaulters for tenant {}", tenantId);

        // In production, fetch from InvoiceRepository
        List<DefaulterRecord> defaulters = identifyDefaulters(tenantId);

        int remindersSent = 0;
        int escalations = 0;

        for (DefaulterRecord defaulter : defaulters) {
            AlertAction action = determineAction(defaulter);

            if (action != AlertAction.NONE) {
                executeAction(tenantId, defaulter, action);
                if (action == AlertAction.ESCALATE) {
                    escalations++;
                } else {
                    remindersSent++;
                }
            }
        }

        return new DefaulterProcessingResult(
                LocalDate.now(),
                defaulters.size(),
                remindersSent,
                escalations);
    }

    /**
     * Identify students with overdue payments.
     */
    private List<DefaulterRecord> identifyDefaulters(UUID tenantId) {
        // In production, query database
        return new ArrayList<>();
    }

    /**
     * Determine what action to take based on days overdue.
     */
    public AlertAction determineAction(DefaulterRecord defaulter) {
        long daysOverdue = defaulter.daysOverdue();
        LocalDate lastReminderDate = defaulter.lastReminderDate();

        // Don't send reminders more than once every 3 days
        if (lastReminderDate != null &&
                ChronoUnit.DAYS.between(lastReminderDate, LocalDate.now()) < 3) {
            return AlertAction.NONE;
        }

        if (daysOverdue >= CRITICAL_THRESHOLD) {
            return AlertAction.ESCALATE; // Escalate to principal
        } else if (daysOverdue >= ESCALATION_THRESHOLD) {
            return AlertAction.FINAL_NOTICE;
        } else if (daysOverdue >= WARNING_THRESHOLD) {
            return AlertAction.WARNING;
        } else if (daysOverdue >= REMINDER_THRESHOLD) {
            return AlertAction.REMINDER;
        }

        return AlertAction.NONE;
    }

    /**
     * Execute the determined action.
     */
    private void executeAction(UUID tenantId, DefaulterRecord defaulter, AlertAction action) {
        log.info("Executing {} for student {} ({}₹ overdue {} days)",
                action, defaulter.studentId(), defaulter.amountDue(), defaulter.daysOverdue());

        String message = buildMessage(defaulter, action);

        // In production, call CommunicationService
        // Send SMS
        // Send WhatsApp
        // Send Email

        // Log the action
        logReminderSent(tenantId, defaulter.studentId(), action, message);
    }

    /**
     * Build message based on action type.
     */
    private String buildMessage(DefaulterRecord defaulter, AlertAction action) {
        return switch (action) {
            case REMINDER -> String.format(
                    "Dear Parent, This is a gentle reminder that fee of ₹%.2f for %s is overdue " +
                            "since %s. Please pay at your earliest convenience. - School Office",
                    defaulter.amountDue(), defaulter.studentName(), defaulter.dueDate());
            case WARNING -> String.format(
                    "Dear Parent, Fee payment of ₹%.2f for %s is now %d days overdue. " +
                            "Please clear the dues immediately to avoid further action. - School Office",
                    defaulter.amountDue(), defaulter.studentName(), defaulter.daysOverdue());
            case FINAL_NOTICE -> String.format(
                    "URGENT: Final Notice - Fee of ₹%.2f for %s is seriously overdue (%d days). " +
                            "Please pay within 3 days to avoid academic restrictions. - School Administration",
                    defaulter.amountDue(), defaulter.studentName(), defaulter.daysOverdue());
            case ESCALATE -> String.format(
                    "CRITICAL: Student %s has fees overdue for %d days. Amount: ₹%.2f. " +
                            "Escalating to administration for action.",
                    defaulter.studentName(), defaulter.daysOverdue(), defaulter.amountDue());
            default -> "";
        };
    }

    /**
     * Log reminder sent for tracking.
     */
    private void logReminderSent(UUID tenantId, UUID studentId, AlertAction action, String message) {
        // In production, save to reminder_history table
        log.info("Reminder logged: tenant={}, student={}, action={}", tenantId, studentId, action);
    }

    /**
     * Get escalation report for admin.
     */
    public EscalationReport getEscalationReport(UUID tenantId) {
        // In production, aggregate from database
        return new EscalationReport(
                0, // Total defaulters
                BigDecimal.ZERO, // Total overdue
                0, // Critical (60+ days)
                0, // Serious (30-60 days)
                0, // Warning (15-30 days)
                0 // Reminder (7-15 days)
        );
    }

    // DTOs

    public record DefaulterRecord(
            UUID studentId,
            String studentName,
            String className,
            UUID invoiceId,
            BigDecimal amountDue,
            LocalDate dueDate,
            long daysOverdue,
            LocalDate lastReminderDate,
            int reminderCount,
            String parentPhone,
            String parentEmail) {
    }

    public record DefaulterProcessingResult(
            LocalDate processedDate,
            int totalDefaulters,
            int remindersSent,
            int escalations) {
    }

    public record EscalationReport(
            int totalDefaulters,
            BigDecimal totalOverdueAmount,
            int criticalCount,
            int seriousCount,
            int warningCount,
            int reminderCount) {
    }

    public enum AlertAction {
        NONE,
        REMINDER, // 7+ days
        WARNING, // 15+ days
        FINAL_NOTICE, // 30+ days
        ESCALATE // 60+ days
    }
}
