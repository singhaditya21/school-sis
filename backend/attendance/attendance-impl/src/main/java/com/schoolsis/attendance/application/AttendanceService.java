package com.schoolsis.attendance.application;

import com.schoolsis.attendance.domain.model.Attendance;
import com.schoolsis.attendance.domain.model.AttendanceStatus;
import com.schoolsis.attendance.domain.repository.AttendanceRepository;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * Service for attendance management.
 */
@Service
@Transactional
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final AuditService auditService;
    private final AttendanceNotificationService notificationService;

    public AttendanceService(AttendanceRepository attendanceRepository,
            AuditService auditService,
            AttendanceNotificationService notificationService) {
        this.attendanceRepository = attendanceRepository;
        this.auditService = auditService;
        this.notificationService = notificationService;
    }

    /**
     * Mark attendance for a class on a date.
     */
    public List<Attendance> markClassAttendance(MarkAttendanceCommand command) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        // Delete existing records for this class/date (replace mode)
        attendanceRepository.deleteByTenantIdAndClassGroupIdAndDate(tenantId, command.classGroupId(), command.date());

        List<Attendance> records = new ArrayList<>();

        for (var entry : command.records()) {
            Attendance attendance = new Attendance(
                    entry.studentId(),
                    command.classGroupId(),
                    command.date(),
                    entry.status(),
                    command.markedBy());
            attendance.setTenantId(tenantId);
            attendance.setRemarks(entry.remarks());

            records.add(attendanceRepository.save(attendance));

            // Queue notification for absent/late students
            if (notificationService.shouldNotify(tenantId, entry.status().name())) {
                notificationService.notifyParentOfAbsence(tenantId,
                        new AttendanceNotificationService.AbsenceNotification(
                                entry.studentId(),
                                "Student", // TODO: Fetch from StudentRepository
                                "Class", // TODO: Fetch class name
                                "", // TODO: Parent phone
                                "", // TODO: Parent email
                                command.date(),
                                entry.status().name(),
                                entry.remarks(),
                                "School" // TODO: Fetch tenant name
                        ));
            }
        }

        auditService.log(tenantId, command.markedBy(), "MARK_ATTENDANCE", "ClassGroup", command.classGroupId());

        return records;
    }

    /**
     * Get attendance for a class on a date.
     */
    @Transactional(readOnly = true)
    public List<Attendance> getClassAttendance(UUID classGroupId, LocalDate date) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return attendanceRepository.findByTenantIdAndClassGroupIdAndDate(tenantId, classGroupId, date);
    }

    /**
     * Get student attendance summary for a date range.
     */
    @Transactional(readOnly = true)
    public StudentAttendanceSummary getStudentAttendanceSummary(UUID studentId, LocalDate startDate,
            LocalDate endDate) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        long present = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                tenantId, studentId, AttendanceStatus.PRESENT, startDate, endDate);
        long absent = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                tenantId, studentId, AttendanceStatus.ABSENT, startDate, endDate);
        long late = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                tenantId, studentId, AttendanceStatus.LATE, startDate, endDate);
        long leave = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                tenantId, studentId, AttendanceStatus.LEAVE, startDate, endDate);

        long total = present + absent + late + leave;
        double percentage = total > 0 ? (present * 100.0) / total : 0;

        return new StudentAttendanceSummary(studentId, present, absent, late, leave, total, percentage);
    }

    /**
     * Get daily attendance stats for tenant.
     */
    @Transactional(readOnly = true)
    public DailyAttendanceStats getDailyStats(LocalDate date) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        List<Object[]> results = attendanceRepository.countByTenantIdAndDateGroupByStatus(tenantId, date);

        Map<AttendanceStatus, Long> counts = new EnumMap<>(AttendanceStatus.class);
        for (Object[] row : results) {
            counts.put((AttendanceStatus) row[0], (Long) row[1]);
        }

        long present = counts.getOrDefault(AttendanceStatus.PRESENT, 0L);
        long absent = counts.getOrDefault(AttendanceStatus.ABSENT, 0L);
        long late = counts.getOrDefault(AttendanceStatus.LATE, 0L);
        long total = counts.values().stream().mapToLong(Long::longValue).sum();

        return new DailyAttendanceStats(date, present, absent, late, total);
    }

    // Command and result records
    public record MarkAttendanceCommand(
            UUID classGroupId,
            LocalDate date,
            UUID markedBy,
            List<AttendanceEntry> records) {
    }

    public record AttendanceEntry(
            UUID studentId,
            AttendanceStatus status,
            String remarks) {
    }

    public record StudentAttendanceSummary(
            UUID studentId,
            long present,
            long absent,
            long late,
            long leave,
            long totalDays,
            double attendancePercentage) {
    }

    public record DailyAttendanceStats(
            LocalDate date,
            long present,
            long absent,
            long late,
            long total) {
    }
}
