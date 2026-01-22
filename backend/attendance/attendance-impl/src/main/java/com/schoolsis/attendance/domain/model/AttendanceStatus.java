package com.schoolsis.attendance.domain.model;

/**
 * Attendance status enum.
 * Maps to AttendanceStatus from Prisma schema.
 */
public enum AttendanceStatus {
    PRESENT,
    ABSENT,
    LATE,
    LEAVE,
    HALF_DAY,
    EXCUSED
}
