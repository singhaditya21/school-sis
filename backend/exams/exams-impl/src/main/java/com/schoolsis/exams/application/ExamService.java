package com.schoolsis.exams.application;

import com.schoolsis.common.exception.EntityNotFoundException;
import com.schoolsis.exams.domain.model.*;
import com.schoolsis.exams.domain.repository.*;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class ExamService {

    private final ExamRepository examRepository;
    private final MarkRepository markRepository;
    private final AuditService auditService;

    public ExamService(ExamRepository examRepository, MarkRepository markRepository, AuditService auditService) {
        this.examRepository = examRepository;
        this.markRepository = markRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<Exam> getExams() {
        return examRepository.findByTenantId(TenantContext.getCurrentTenantId());
    }

    @Transactional(readOnly = true)
    public Exam getExam(UUID id) {
        return examRepository.findByTenantIdAndId(TenantContext.getCurrentTenantId(), id)
                .orElseThrow(() -> new EntityNotFoundException("Exam", id));
    }

    public Exam createExam(CreateExamCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Exam exam = new Exam(cmd.name(), cmd.academicYear());
        exam.setTenantId(tenantId);
        exam.setTerm(cmd.term());
        exam.setStartDate(cmd.startDate());
        exam.setEndDate(cmd.endDate());
        exam = examRepository.save(exam);
        auditService.log(tenantId, null, "CREATE", "Exam", exam.getId());
        return exam;
    }

    public List<Mark> enterMarks(EnterMarksCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<Mark> saved = cmd.marks().stream().map(m -> {
            Mark mark = markRepository.findByExamIdAndStudentIdAndSubject(cmd.examId(), m.studentId(), m.subject())
                    .orElseGet(() -> {
                        Mark newMark = new Mark(cmd.examId(), m.studentId(), m.subject());
                        newMark.setTenantId(tenantId);
                        return newMark;
                    });
            mark.setMarksObtained(m.marksObtained());
            mark.setMaxMarks(m.maxMarks());
            mark.setGrade(calculateGrade(m.marksObtained(), m.maxMarks()));
            mark.setRemarks(m.remarks());
            mark.setEnteredBy(cmd.enteredBy());
            return markRepository.save(mark);
        }).toList();
        auditService.log(tenantId, cmd.enteredBy(), "ENTER_MARKS", "Exam", cmd.examId());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<Mark> getStudentMarks(UUID studentId) {
        return markRepository.findByTenantIdAndStudentId(TenantContext.getCurrentTenantId(), studentId);
    }

    private String calculateGrade(BigDecimal obtained, BigDecimal max) {
        if (obtained == null || max == null || max.compareTo(BigDecimal.ZERO) == 0)
            return "N/A";
        double pct = obtained.multiply(BigDecimal.valueOf(100)).divide(max, 2, RoundingMode.HALF_UP).doubleValue();
        if (pct >= 90)
            return "A+";
        if (pct >= 80)
            return "A";
        if (pct >= 70)
            return "B+";
        if (pct >= 60)
            return "B";
        if (pct >= 50)
            return "C";
        if (pct >= 40)
            return "D";
        return "F";
    }

    public record CreateExamCommand(String name, String academicYear, String term, LocalDate startDate,
            LocalDate endDate) {
    }

    public record EnterMarksCommand(UUID examId, UUID enteredBy, List<MarkEntry> marks) {
    }

    public record MarkEntry(UUID studentId, String subject, BigDecimal marksObtained, BigDecimal maxMarks,
            String remarks) {
    }
}
