package com.schoolsis.attendance.application;

import com.schoolsis.attendance.domain.model.Attendance;
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
         * Mark attendance for students on a date.
         */
        public List<Attendance> markAttendance(MarkAttendanceCommand command) {
                UUID tenantId = TenantContext.getCurrentTenantId();

                List<Attendance> records = new ArrayList<>();

                for (var entry : command.records()) {
                        // Check if already marked
                        Optional<Attendance> existing = attendanceRepository.findByTenantIdAndStudentIdAndDate(
                                        tenantId, entry.studentId(), command.date());

                        Attendance attendance;
                        if (existing.isPresent()) {
                                attendance = existing.get();
                                attendance.setStatus(entry.status());
                                attendance.setRemarks(entry.remarks());
                                attendance.setMarkedBy(command.markedBy());
                        } else {
                                attendance = new Attendance(entry.studentId(), command.date(), entry.status(),
                                                command.markedBy());
                                attendance.setTenantId(tenantId);
                                attendance.setRemarks(entry.remarks());
                        }

                        records.add(attendanceRepository.save(attendance));

                        // Queue notification for absent students
                        if ("ABSENT".equals(entry.status())) {
                                notificationService.notifyParentOfAbsence(tenantId,
                                                new AttendanceNotificationService.AbsenceNotification(
                                                                entry.studentId(),
                                                                "Student",
                                                                "Class",
                                                                "",
                                                                "",
                                                                command.date(),
                                                                entry.status(),
                                                                entry.remarks(),
                                                                "School"));
                        }
                }

                auditService.log(tenantId, command.markedBy(), "MARK_ATTENDANCE", "Attendance", null);

                return records;
        }

        /**
         * Get attendance for a date.
         */
        @Transactional(readOnly = true)
        public List<Attendance> getAttendanceByDate(LocalDate date) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                return attendanceRepository.findByTenantIdAndDate(tenantId, date);
        }

        /**
         * Get student attendance summary for a date range.
         */
        @Transactional(readOnly = true)
        public StudentAttendanceSummary getStudentAttendanceSummary(UUID studentId, LocalDate startDate,
                        LocalDate endDate) {
                UUID tenantId = TenantContext.getCurrentTenantId();

                long present = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                                tenantId, studentId, "PRESENT", startDate, endDate);
                long absent = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                                tenantId, studentId, "ABSENT", startDate, endDate);
                long late = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                                tenantId, studentId, "LATE", startDate, endDate);
                long leave = attendanceRepository.countByTenantIdAndStudentIdAndStatusAndDateBetween(
                                tenantId, studentId, "LEAVE", startDate, endDate);

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

                Map<String, Long> counts = new HashMap<>();
                for (Object[] row : results) {
                        counts.put((String) row[0], (Long) row[1]);
                }

                long present = counts.getOrDefault("PRESENT", 0L);
                long absent = counts.getOrDefault("ABSENT", 0L);
                long late = counts.getOrDefault("LATE", 0L);
                long total = counts.values().stream().mapToLong(Long::longValue).sum();

                return new DailyAttendanceStats(date, present, absent, late, total);
        }

        // Command and result records
        public record MarkAttendanceCommand(
                        LocalDate date,
                        UUID markedBy,
                        List<AttendanceEntry> records) {
        }

        public record AttendanceEntry(
                        UUID studentId,
                        String status,
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
