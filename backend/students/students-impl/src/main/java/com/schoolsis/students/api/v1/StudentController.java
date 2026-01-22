package com.schoolsis.students.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.students.application.StudentService;
import com.schoolsis.students.application.StudentService.CreateStudentCommand;
import com.schoolsis.students.application.StudentService.UpdateStudentCommand;
import com.schoolsis.students.domain.model.Student;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * REST controller for student management.
 */
@RestController
@RequestMapping("/api/v1/students")
public class StudentController {

    private final StudentService studentService;

    public StudentController(StudentService studentService) {
        this.studentService = studentService;
    }

    /**
     * Get all active students (paginated).
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<Page<StudentResponse>> getStudents(Pageable pageable) {
        Page<Student> students = studentService.getActiveStudents(pageable);
        return ApiResponse.ok(students.map(this::toResponse));
    }

    /**
     * Get student by ID.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<StudentResponse> getStudent(@PathVariable UUID id) {
        Student student = studentService.getStudent(id);
        return ApiResponse.ok(toResponse(student));
    }

    /**
     * Get students by class group.
     */
    @GetMapping("/class/{classGroupId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<StudentResponse>> getStudentsByClass(@PathVariable UUID classGroupId) {
        List<Student> students = studentService.getStudentsByClassGroup(classGroupId);
        return ApiResponse.ok(students.stream().map(this::toResponse).toList());
    }

    /**
     * Create new student.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR')")
    public ApiResponse<StudentResponse> createStudent(@Valid @RequestBody CreateStudentRequest request) {
        CreateStudentCommand command = new CreateStudentCommand(
            request.admissionNumber(),
            request.firstName(),
            request.lastName(),
            request.dateOfBirth(),
            request.gender(),
            request.bloodGroup(),
            request.classGroupId()
        );

        Student student = studentService.createStudent(command);
        return ApiResponse.ok(toResponse(student));
    }

    /**
     * Update existing student.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<StudentResponse> updateStudent(
        @PathVariable UUID id,
        @Valid @RequestBody UpdateStudentRequest request
    ) {
        UpdateStudentCommand command = new UpdateStudentCommand(
            request.firstName(),
            request.lastName(),
            request.dateOfBirth(),
            request.gender(),
            request.bloodGroup(),
            request.classGroupId()
        );

        Student student = studentService.updateStudent(id, command);
        return ApiResponse.ok(toResponse(student));
    }

    /**
     * Soft delete student.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
    public void deleteStudent(@PathVariable UUID id) {
        studentService.deactivateStudent(id);
    }

    /**
     * Get student count.
     */
    @GetMapping("/count")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<Long> countStudents() {
        return ApiResponse.ok(studentService.countActiveStudents());
    }

    // DTO mapping
    private StudentResponse toResponse(Student student) {
        return new StudentResponse(
            student.getId(),
            student.getAdmissionNumber(),
            student.getFirstName(),
            student.getLastName(),
            student.getFullName(),
            student.getDateOfBirth(),
            student.getGender(),
            student.getBloodGroup(),
            student.getClassGroupId(),
            student.isActive(),
            student.getCreatedAt(),
            student.getUpdatedAt()
        );
    }

    // Request/Response records
    public record CreateStudentRequest(
        @NotBlank String admissionNumber,
        @NotBlank String firstName,
        @NotBlank String lastName,
        @NotNull LocalDate dateOfBirth,
        String gender,
        String bloodGroup,
        UUID classGroupId
    ) {}

    public record UpdateStudentRequest(
        String firstName,
        String lastName,
        LocalDate dateOfBirth,
        String gender,
        String bloodGroup,
        UUID classGroupId
    ) {}

    public record StudentResponse(
        UUID id,
        String admissionNumber,
        String firstName,
        String lastName,
        String fullName,
        LocalDate dateOfBirth,
        String gender,
        String bloodGroup,
        UUID classGroupId,
        boolean active,
        java.time.Instant createdAt,
        java.time.Instant updatedAt
    ) {}
}
