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
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class ExamService {

    private final ExamRepository examRepository;
    private final MarkRepository markRepository;
    private final ReportCardRepository reportCardRepository;
    private final AuditService auditService;

    public ExamService(ExamRepository examRepository, MarkRepository markRepository,
                       ReportCardRepository reportCardRepository, AuditService auditService) {
        this.examRepository = examRepository;
        this.markRepository = markRepository;
        this.reportCardRepository = reportCardRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<Exam> getActiveExams() {
        return examRepository.findActiveByTenantId(TenantContext.getCurrentTenantId());
    }

    @Transactional(readOnly = true)
    public Exam getExam(UUID id) {
        return examRepository.findByTenantIdAndId(TenantContext.getCurrentTenantId(), id)
            .orElseThrow(() -> new EntityNotFoundException("Exam", id));
    }

    public Exam createExam(CreateExamCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Exam exam = new Exam(cmd.name(), cmd.type(), cmd.maxMarks(), cmd.passingMarks());
        exam.setTenantId(tenantId);
        exam.setAcademicYearId(cmd.academicYearId());
        exam.setTermId(cmd.termId());
        exam.setStartDate(cmd.startDate());
        exam.setEndDate(cmd.endDate());
        exam = examRepository.save(exam);
        auditService.log(tenantId, null, "CREATE", "Exam", exam.getId());
        return exam;
    }

    public List<Mark> enterMarks(EnterMarksCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<Mark> saved = cmd.marks().stream().map(m -> {
            Mark mark = markRepository.findByExamIdAndStudentIdAndSubjectId(cmd.examId(), m.studentId(), m.subjectId())
                .orElseGet(() -> {
                    Mark newMark = new Mark(cmd.examId(), m.studentId(), m.subjectId(), m.marksObtained());
                    newMark.setTenantId(tenantId);
                    return newMark;
                });
            mark.setMarksObtained(m.marksObtained());
            mark.setAbsent(m.isAbsent());
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

    public ReportCard generateReportCard(UUID studentId, UUID termId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<Mark> marks = markRepository.findByTenantIdAndStudentId(tenantId, studentId);
        
        BigDecimal total = marks.stream().filter(m -> !m.isAbsent())
            .map(Mark::getMarksObtained).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal max = BigDecimal.valueOf(marks.size() * 100);
        BigDecimal pct = max.compareTo(BigDecimal.ZERO) > 0 
            ? total.multiply(BigDecimal.valueOf(100)).divide(max, 2, RoundingMode.HALF_UP) 
            : BigDecimal.ZERO;
        
        ReportCard rc = reportCardRepository.findByStudentIdAndTermId(studentId, termId)
            .orElseGet(() -> {
                ReportCard newRc = new ReportCard();
                newRc.setTenantId(tenantId);
                newRc.setStudentId(studentId);
                newRc.setTermId(termId);
                return newRc;
            });
        rc.setTotalMarks(total);
        rc.setMaxMarks(max);
        rc.setPercentage(pct);
        rc.setGrade(calculateGrade(pct));
        rc.setGeneratedAt(Instant.now());
        return reportCardRepository.save(rc);
    }

    private String calculateGrade(BigDecimal percentage) {
        double pct = percentage.doubleValue();
        if (pct >= 90) return "A+";
        if (pct >= 80) return "A";
        if (pct >= 70) return "B+";
        if (pct >= 60) return "B";
        if (pct >= 50) return "C";
        if (pct >= 40) return "D";
        return "F";
    }

    public record CreateExamCommand(String name, ExamType type, BigDecimal maxMarks, BigDecimal passingMarks,
        UUID academicYearId, UUID termId, LocalDate startDate, LocalDate endDate) {}
    public record EnterMarksCommand(UUID examId, UUID enteredBy, List<MarkEntry> marks) {}
    public record MarkEntry(UUID studentId, UUID subjectId, BigDecimal marksObtained, boolean isAbsent, String remarks) {}
}
