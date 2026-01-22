package com.schoolsis.exams.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.exams.application.ExamService;
import com.schoolsis.exams.application.ExamService.*;
import com.schoolsis.exams.domain.model.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/exams")
public class ExamController {

    private final ExamService examService;

    public ExamController(ExamService examService) {
        this.examService = examService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<ExamResponse>> getExams() {
        return ApiResponse.ok(examService.getActiveExams().stream().map(this::toResponse).toList());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<ExamResponse> getExam(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(examService.getExam(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<ExamResponse> createExam(@Valid @RequestBody CreateExamRequest req) {
        Exam exam = examService.createExam(new CreateExamCommand(req.name(), req.type(), req.maxMarks(),
            req.passingMarks(), req.academicYearId(), req.termId(), req.startDate(), req.endDate()));
        return ApiResponse.ok(toResponse(exam));
    }

    @PostMapping("/{examId}/marks")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<MarkResponse>> enterMarks(@PathVariable UUID examId, @Valid @RequestBody EnterMarksRequest req) {
        List<Mark> marks = examService.enterMarks(new EnterMarksCommand(examId, req.enteredBy(),
            req.marks().stream().map(m -> new MarkEntry(m.studentId(), m.subjectId(), m.marksObtained(), m.isAbsent(), m.remarks())).toList()));
        return ApiResponse.ok(marks.stream().map(this::toMarkResponse).toList());
    }

    @GetMapping("/student/{studentId}/marks")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')")
    public ApiResponse<List<MarkResponse>> getStudentMarks(@PathVariable UUID studentId) {
        return ApiResponse.ok(examService.getStudentMarks(studentId).stream().map(this::toMarkResponse).toList());
    }

    @PostMapping("/report-card/{studentId}/{termId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<ReportCardResponse> generateReportCard(@PathVariable UUID studentId, @PathVariable UUID termId) {
        ReportCard rc = examService.generateReportCard(studentId, termId);
        return ApiResponse.ok(toReportCardResponse(rc));
    }

    private ExamResponse toResponse(Exam e) {
        return new ExamResponse(e.getId(), e.getName(), e.getType(), e.getMaxMarks(), e.getPassingMarks(),
            e.getStartDate(), e.getEndDate(), e.isActive(), e.getCreatedAt());
    }

    private MarkResponse toMarkResponse(Mark m) {
        return new MarkResponse(m.getId(), m.getExamId(), m.getStudentId(), m.getSubjectId(),
            m.getMarksObtained(), m.isAbsent(), m.getRemarks());
    }

    private ReportCardResponse toReportCardResponse(ReportCard r) {
        return new ReportCardResponse(r.getId(), r.getStudentId(), r.getTermId(), r.getTotalMarks(),
            r.getMaxMarks(), r.getPercentage(), r.getGrade(), r.getRank(), r.getGeneratedAt());
    }

    public record CreateExamRequest(@NotBlank String name, @NotNull ExamType type, @NotNull BigDecimal maxMarks,
        @NotNull BigDecimal passingMarks, @NotNull UUID academicYearId, UUID termId,
        @NotNull LocalDate startDate, @NotNull LocalDate endDate) {}
    public record EnterMarksRequest(@NotNull UUID enteredBy, @NotNull List<MarkInput> marks) {}
    public record MarkInput(@NotNull UUID studentId, @NotNull UUID subjectId, BigDecimal marksObtained, boolean isAbsent, String remarks) {}
    public record ExamResponse(UUID id, String name, ExamType type, BigDecimal maxMarks, BigDecimal passingMarks,
        LocalDate startDate, LocalDate endDate, boolean active, Instant createdAt) {}
    public record MarkResponse(UUID id, UUID examId, UUID studentId, UUID subjectId, BigDecimal marksObtained, boolean absent, String remarks) {}
    public record ReportCardResponse(UUID id, UUID studentId, UUID termId, BigDecimal totalMarks, BigDecimal maxMarks,
        BigDecimal percentage, String grade, Integer rank, Instant generatedAt) {}
}
