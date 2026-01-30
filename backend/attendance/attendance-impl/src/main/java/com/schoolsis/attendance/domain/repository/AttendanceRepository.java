package com.schoolsis.attendance.domain.repository;

import com.schoolsis.attendance.domain.model.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
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

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.date = :date")
    List<Attendance> findByTenantIdAndDate(UUID tenantId, LocalDate date);

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.date = :date")
    Optional<Attendance> findByTenantIdAndStudentIdAndDate(UUID tenantId, UUID studentId, LocalDate date);

    @Query("SELECT a FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.date BETWEEN :startDate AND :endDate")
    List<Attendance> findByTenantIdAndStudentIdAndDateBetween(UUID tenantId, UUID studentId, LocalDate startDate,
            LocalDate endDate);

    @Query("SELECT COUNT(a) FROM Attendance a WHERE a.tenantId = :tenantId AND a.studentId = :studentId AND a.status = :status AND a.date BETWEEN :startDate AND :endDate")
    long countByTenantIdAndStudentIdAndStatusAndDateBetween(UUID tenantId, UUID studentId, String status,
            LocalDate startDate, LocalDate endDate);

    @Query("SELECT a.status, COUNT(a) FROM Attendance a WHERE a.tenantId = :tenantId AND a.date = :date GROUP BY a.status")
    List<Object[]> countByTenantIdAndDateGroupByStatus(UUID tenantId, LocalDate date);
}
