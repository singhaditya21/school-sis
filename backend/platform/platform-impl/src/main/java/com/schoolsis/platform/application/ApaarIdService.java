package com.schoolsis.platform.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.UUID;

/**
 * APAAR ID (Automated Permanent Academic Account Registry) Service.
 * Manages student unique ID requests and integration with DigiLocker.
 * 
 * APAAR is India's new initiative for unique student IDs that follow
 * students throughout their academic journey.
 */
@Service
public class ApaarIdService {

    private static final Logger log = LoggerFactory.getLogger(ApaarIdService.class);

    /**
     * Request APAAR ID for a student.
     */
    public ApaarRequest requestApaarId(UUID tenantId, ApaarStudentData student) {
        log.info("Requesting APAAR ID for student {} in tenant {}", student.name(), tenantId);

        // Validate required fields
        validateStudentData(student);

        // In production, call DigiLocker/APAAR API
        // For now, create a pending request
        return new ApaarRequest(
                UUID.randomUUID(),
                student.studentId(),
                student.name(),
                student.dateOfBirth(),
                student.aadhaarLast4(), // Only last 4 digits stored for privacy
                RequestStatus.PENDING,
                null, // APAAR ID assigned after approval
                LocalDate.now(),
                null);
    }

    /**
     * Check status of APAAR request.
     */
    public ApaarRequest checkRequestStatus(UUID requestId) {
        // In production, query DigiLocker API
        log.info("Checking APAAR request status for {}", requestId);
        return null;
    }

    /**
     * Link APAAR ID to student record.
     */
    public void linkApaarId(UUID tenantId, UUID studentId, String apaarId) {
        log.info("Linking APAAR ID {} to student {} in tenant {}", apaarId, studentId, tenantId);
        // In production, update Student entity with APAAR ID
    }

    /**
     * Validate student data for APAAR request.
     */
    private void validateStudentData(ApaarStudentData student) {
        if (student.name() == null || student.name().isBlank()) {
            throw new IllegalArgumentException("Student name is required");
        }
        if (student.dateOfBirth() == null) {
            throw new IllegalArgumentException("Date of birth is required");
        }
        if (student.aadhaarLast4() == null || student.aadhaarLast4().length() != 4) {
            throw new IllegalArgumentException("Last 4 digits of Aadhaar required for verification");
        }
    }

    // DTOs

    public record ApaarStudentData(
            UUID studentId,
            String name,
            LocalDate dateOfBirth,
            String gender,
            String aadhaarLast4,
            String fatherName,
            String motherName,
            String currentClass,
            String schoolUdiseCode) {
    }

    public record ApaarRequest(
            UUID requestId,
            UUID studentId,
            String studentName,
            LocalDate dateOfBirth,
            String aadhaarLast4,
            RequestStatus status,
            String apaarId,
            LocalDate requestDate,
            LocalDate processedDate) {
    }

    public enum RequestStatus {
        PENDING, // Request submitted
        PROCESSING, // Being verified
        APPROVED, // APAAR ID assigned
        REJECTED, // Verification failed
        LINKED // Linked to student record
    }
}
