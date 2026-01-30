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
        return ApiResponse.ok(examService.getExams().stream().map(this::toResponse).toList());
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
        Exam exam = examService.createExam(new CreateExamCommand(
                req.name(), req.academicYear(), req.term(), req.startDate(), req.endDate()));
        return ApiResponse.ok(toResponse(exam));
    }

    @PostMapping("/{examId}/marks")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<MarkResponse>> enterMarks(@PathVariable UUID examId,
            @Valid @RequestBody EnterMarksRequest req) {
        List<Mark> marks = examService.enterMarks(new EnterMarksCommand(examId, req.enteredBy(),
                req.marks().stream().map(
                        m -> new MarkEntry(m.studentId(), m.subject(), m.marksObtained(), m.maxMarks(), m.remarks()))
                        .toList()));
        return ApiResponse.ok(marks.stream().map(this::toMarkResponse).toList());
    }

    @GetMapping("/student/{studentId}/marks")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')")
    public ApiResponse<List<MarkResponse>> getStudentMarks(@PathVariable UUID studentId) {
        return ApiResponse.ok(examService.getStudentMarks(studentId).stream().map(this::toMarkResponse).toList());
    }

    private ExamResponse toResponse(Exam e) {
        return new ExamResponse(e.getId(), e.getName(), e.getAcademicYear(), e.getTerm(),
                e.getStartDate(), e.getEndDate(), e.isPublished(), e.getCreatedAt());
    }

    private MarkResponse toMarkResponse(Mark m) {
        return new MarkResponse(m.getId(), m.getExamId(), m.getStudentId(), m.getSubject(),
                m.getMarksObtained(), m.getMaxMarks(), m.getGrade(), m.getRemarks());
    }

    public record CreateExamRequest(
            @NotBlank String name,
            @NotBlank String academicYear,
            String term,
            LocalDate startDate,
            LocalDate endDate) {
    }

    public record EnterMarksRequest(@NotNull UUID enteredBy, @NotNull List<MarkInput> marks) {
    }

    public record MarkInput(
            @NotNull UUID studentId,
            @NotBlank String subject,
            BigDecimal marksObtained,
            BigDecimal maxMarks,
            String remarks) {
    }

    public record ExamResponse(
            UUID id, String name, String academicYear, String term,
            LocalDate startDate, LocalDate endDate, boolean published, Instant createdAt) {
    }

    public record MarkResponse(
            UUID id, UUID examId, UUID studentId, String subject,
            BigDecimal marksObtained, BigDecimal maxMarks, String grade, String remarks) {
    }
}
