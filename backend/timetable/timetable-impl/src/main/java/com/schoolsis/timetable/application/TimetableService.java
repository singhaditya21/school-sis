package com.schoolsis.timetable.application;

import com.schoolsis.platform.infrastructure.TenantContext;
import com.schoolsis.timetable.domain.model.*;
import com.schoolsis.timetable.domain.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class TimetableService {

    private final TimetableRepository timetableRepository;
    private final SubjectRepository subjectRepository;

    public TimetableService(TimetableRepository timetableRepository, SubjectRepository subjectRepository) {
        this.timetableRepository = timetableRepository;
        this.subjectRepository = subjectRepository;
    }

    @Transactional(readOnly = true)
    public List<Subject> getSubjects() {
        return subjectRepository.findActiveByTenantId(TenantContext.getCurrentTenantId());
    }

    @Transactional(readOnly = true)
    public List<TimetableEntry> getClassTimetable(UUID classGroupId) {
        return timetableRepository.findByTenantIdAndClassGroupId(TenantContext.getCurrentTenantId(), classGroupId);
    }

    @Transactional(readOnly = true)
    public List<TimetableEntry> getTeacherTimetable(UUID teacherId) {
        return timetableRepository.findByTenantIdAndTeacherId(TenantContext.getCurrentTenantId(), teacherId);
    }

    public TimetableEntry createEntry(CreateEntryCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        TimetableEntry entry = new TimetableEntry();
        entry.setTenantId(tenantId);
        entry.setClassGroupId(cmd.classGroupId());
        entry.setDayOfWeek(cmd.dayOfWeek());
        entry.setPeriodId(cmd.periodId());
        entry.setSubjectId(cmd.subjectId());
        entry.setTeacherId(cmd.teacherId());
        entry.setRoom(cmd.room());
        return timetableRepository.save(entry);
    }

    public Subject createSubject(String name, String code, String description) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Subject subject = new Subject();
        subject.setTenantId(tenantId);
        subject.setName(name);
        subject.setCode(code);
        subject.setDescription(description);
        return subjectRepository.save(subject);
    }

    public record CreateEntryCommand(UUID classGroupId, Integer dayOfWeek, UUID periodId, UUID subjectId, UUID teacherId, String room) {}
}
