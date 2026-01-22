package com.schoolsis.attendance.domain.repository;

import com.schoolsis.attendance.domain.model.Attendance;
import com.schoolsis.attendance.domain.model.AttendanceStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Attendance entity.
 */
@Repository
public interface AttendanceRepository extends JpaRepository<Attendance, UUID> {

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.classGroupId = :classGroupId AND a.date = :date")
    List<Attendance> findByTenantIdAndClassGroupIdAndDate(UUID tenantId, UUID classGroupId, LocalDate date);

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.date = :date AND a.periodId IS NULL")
    Optional<Attendance> findDailyAttendance(UUID tenantId, UUID studentId, LocalDate date);

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.date BETWEEN :startDate AND :endDate")
    List<Attendance> findByTenantIdAndStudentIdAndDateBetween(UUID tenantId, UUID studentId, LocalDate startDate, LocalDate endDate);

    @Query("SELECT COUNT(a) FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.status = :status AND a.date BETWEEN :startDate AND :endDate")
    long countByTenantIdAndStudentIdAndStatusAndDateBetween(UUID tenantId, UUID studentId, AttendanceStatus status, LocalDate startDate, LocalDate endDate);

    @Query("SELECT COUNT(a) FROM Attendance a WHERE a.tenantId = :tenantId AND a.classGroupId = :classGroupId AND a.date = :date")
    long countByTenantIdAndClassGroupIdAndDate(UUID tenantId, UUID classGroupId, LocalDate date);

    @Query("SELECT a.status, COUNT(a) FROM Attendance a WHERE a.tenantId = :tenantId AND a.date = :date GROUP BY a.status")
    List<Object[]> countByTenantIdAndDateGroupByStatus(UUID tenantId, LocalDate date);

    @Modifying
    @Query("DELETE FROM Attendance a WHERE a.tenantId = :tenantId AND a.classGroupId = :classGroupId AND a.date = :date AND a.periodId IS NULL")
    void deleteByTenantIdAndClassGroupIdAndDate(UUID tenantId, UUID classGroupId, LocalDate date);
}
