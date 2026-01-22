package com.schoolsis.timetable.domain.repository;

import com.schoolsis.timetable.domain.model.TimetableEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TimetableRepository extends JpaRepository<TimetableEntry, UUID> {

    @Query("SELECT t FROM TimetableEntry t WHERE t.tenantId = :tenantId AND t.classGroupId = :classGroupId ORDER BY t.dayOfWeek, t.periodId")
    List<TimetableEntry> findByTenantIdAndClassGroupId(UUID tenantId, UUID classGroupId);

    @Query("SELECT t FROM TimetableEntry t WHERE t.tenantId = :tenantId AND t.teacherId = :teacherId ORDER BY t.dayOfWeek, t.periodId")
    List<TimetableEntry> findByTenantIdAndTeacherId(UUID tenantId, UUID teacherId);
}
