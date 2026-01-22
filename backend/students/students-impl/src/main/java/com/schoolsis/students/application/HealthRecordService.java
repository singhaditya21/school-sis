package com.schoolsis.students.application;

import com.schoolsis.students.domain.model.HealthRecord;
import com.schoolsis.students.domain.repository.HealthRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing student health records.
 * All operations are tenant-scoped for multi-tenancy.
 */
@Service
@Transactional
public class HealthRecordService {

    private final HealthRecordRepository healthRecordRepository;

    public HealthRecordService(HealthRecordRepository healthRecordRepository) {
        this.healthRecordRepository = healthRecordRepository;
    }

    /**
     * Create or update a health record for a student in an academic year.
     * Only one record per student per academic year is allowed.
     */
    public HealthRecord saveHealthRecord(UUID tenantId, CreateHealthRecordRequest request) {
        // Check for existing record
        Optional<HealthRecord> existingRecord = healthRecordRepository
                .findByTenantIdAndStudentIdAndAcademicYearId(
                        tenantId, request.studentId(), request.academicYearId());

        HealthRecord record;
        if (existingRecord.isPresent()) {
            record = existingRecord.get();
        } else {
            record = new HealthRecord(
                    request.studentId(),
                    request.academicYearId(),
                    request.checkupDate() != null ? request.checkupDate() : LocalDate.now(),
                    request.recordedBy());
            record.setTenantId(tenantId);
        }

        // Update fields
        if (request.checkupDate() != null) {
            record.setCheckupDate(request.checkupDate());
        }
        if (request.height() != null) {
            record.setHeight(request.height());
        }
        if (request.weight() != null) {
            record.setWeight(request.weight());
        }
        if (request.bloodGroup() != null) {
            record.setBloodGroup(request.bloodGroup());
        }
        if (request.vision() != null) {
            record.setVision(request.vision());
        }
        if (request.dental() != null) {
            record.setDental(request.dental());
        }
        if (request.hearing() != null) {
            record.setHearing(request.hearing());
        }
        if (request.generalHealth() != null) {
            record.setGeneralHealth(request.generalHealth());
        }
        if (request.notes() != null) {
            record.setNotes(request.notes());
        }
        record.setRecordedBy(request.recordedBy());

        return healthRecordRepository.save(record);
    }

    /**
     * Get health record for a student in an academic year.
     */
    @Transactional(readOnly = true)
    public Optional<HealthRecord> getHealthRecord(UUID tenantId, UUID studentId, UUID academicYearId) {
        return healthRecordRepository.findByTenantIdAndStudentIdAndAcademicYearId(
                tenantId, studentId, academicYearId);
    }

    /**
     * Get all health records for a student (history across years).
     */
    @Transactional(readOnly = true)
    public List<HealthRecord> getStudentHealthHistory(UUID tenantId, UUID studentId) {
        return healthRecordRepository.findByTenantIdAndStudentIdOrderByCheckupDateDesc(
                tenantId, studentId);
    }

    /**
     * Get health records for multiple students (for report card generation).
     */
    @Transactional(readOnly = true)
    public List<HealthRecord> getHealthRecordsForStudents(
            UUID tenantId, List<UUID> studentIds, UUID academicYearId) {
        return healthRecordRepository.findByTenantIdAndStudentIdsAndAcademicYearId(
                tenantId, studentIds, academicYearId);
    }

    /**
     * Get all health records for an academic year.
     */
    @Transactional(readOnly = true)
    public List<HealthRecord> getHealthRecordsByAcademicYear(UUID tenantId, UUID academicYearId) {
        return healthRecordRepository.findByTenantIdAndAcademicYearIdOrderByCheckupDateDesc(
                tenantId, academicYearId);
    }

    /**
     * Check if health record exists for a student.
     */
    @Transactional(readOnly = true)
    public boolean hasHealthRecord(UUID tenantId, UUID studentId, UUID academicYearId) {
        return healthRecordRepository.existsByTenantIdAndStudentIdAndAcademicYearId(
                tenantId, studentId, academicYearId);
    }

    /**
     * Count students with health records for coverage tracking.
     */
    @Transactional(readOnly = true)
    public long countHealthRecords(UUID tenantId, UUID academicYearId) {
        return healthRecordRepository.countByTenantIdAndAcademicYearId(tenantId, academicYearId);
    }

    /**
     * Request record for creating/updating health records.
     */
    public record CreateHealthRecordRequest(
            UUID studentId,
            UUID academicYearId,
            LocalDate checkupDate,
            BigDecimal height,
            BigDecimal weight,
            String bloodGroup,
            String vision,
            String dental,
            String hearing,
            String generalHealth,
            String notes,
            UUID recordedBy) {
    }
}
