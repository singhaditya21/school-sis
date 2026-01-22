package com.schoolsis.attendance.api.v1;

import com.schoolsis.attendance.application.AttendanceService;
import com.schoolsis.attendance.application.AttendanceService.*;
import com.schoolsis.attendance.domain.model.Attendance;
import com.schoolsis.attendance.domain.model.AttendanceStatus;
import com.schoolsis.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * REST controller for attendance management.
 */
@RestController
@RequestMapping("/api/v1/attendance")
public class AttendanceController {

    private final AttendanceService attendanceService;

    public AttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    /**
     * Mark attendance for a class.
     */
    @PostMapping("/mark")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<AttendanceResponse>> markAttendance(@Valid @RequestBody MarkAttendanceRequest request) {
        MarkAttendanceCommand command = new MarkAttendanceCommand(
            request.classGroupId(),
            request.date(),
            request.markedBy(),
            request.records().stream()
                .map(r -> new AttendanceEntry(r.studentId(), r.status(), r.remarks()))
                .toList()
        );

        List<Attendance> records = attendanceService.markClassAttendance(command);
        return ApiResponse.ok(records.stream().map(this::toResponse).toList());
    }

    /**
     * Get attendance for a class on a date.
     */
    @GetMapping("/class/{classGroupId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<AttendanceResponse>> getClassAttendance(
        @PathVariable UUID classGroupId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        List<Attendance> records = attendanceService.getClassAttendance(classGroupId, date);
        return ApiResponse.ok(records.stream().map(this::toResponse).toList());
    }

    /**
     * Get student attendance summary.
     */
    @GetMapping("/student/{studentId}/summary")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')")
    public ApiResponse<StudentAttendanceSummary> getStudentSummary(
        @PathVariable UUID studentId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate
    ) {
        StudentAttendanceSummary summary = attendanceService.getStudentAttendanceSummary(studentId, startDate, endDate);
        return ApiResponse.ok(summary);
    }

    /**
     * Get daily attendance stats.
     */
    @GetMapping("/stats/daily")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<DailyAttendanceStats> getDailyStats(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        DailyAttendanceStats stats = attendanceService.getDailyStats(date != null ? date : LocalDate.now());
        return ApiResponse.ok(stats);
    }

    // DTO mappings
    private AttendanceResponse toResponse(Attendance attendance) {
        return new AttendanceResponse(
            attendance.getId(),
            attendance.getStudentId(),
            attendance.getClassGroupId(),
            attendance.getDate(),
            attendance.getStatus(),
            attendance.getRemarks(),
            attendance.getMarkedBy(),
            attendance.getMarkedAt()
        );
    }

    // Request/Response records
    public record MarkAttendanceRequest(
        @NotNull UUID classGroupId,
        @NotNull LocalDate date,
        @NotNull UUID markedBy,
        @NotNull List<AttendanceRecord> records
    ) {}

    public record AttendanceRecord(
        @NotNull UUID studentId,
        @NotNull AttendanceStatus status,
        String remarks
    ) {}

    public record AttendanceResponse(
        UUID id,
        UUID studentId,
        UUID classGroupId,
        LocalDate date,
        AttendanceStatus status,
        String remarks,
        UUID markedBy,
        Instant markedAt
    ) {}
}
