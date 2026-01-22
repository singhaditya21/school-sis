package com.schoolsis.students.application;

import com.schoolsis.common.exception.EntityNotFoundException;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import com.schoolsis.students.domain.model.Student;
import com.schoolsis.students.domain.model.Guardian;
import com.schoolsis.students.domain.repository.StudentRepository;
import com.schoolsis.students.domain.repository.GuardianRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service for student management operations.
 */
@Service
@Transactional
public class StudentService {

    private final StudentRepository studentRepository;
    private final GuardianRepository guardianRepository;
    private final AuditService auditService;

    public StudentService(
        StudentRepository studentRepository,
        GuardianRepository guardianRepository,
        AuditService auditService
    ) {
        this.studentRepository = studentRepository;
        this.guardianRepository = guardianRepository;
        this.auditService = auditService;
    }

    /**
     * Get all active students for current tenant.
     */
    @Transactional(readOnly = true)
    public List<Student> getActiveStudents() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return studentRepository.findActiveByTenantId(tenantId);
    }

    /**
     * Get active students with pagination.
     */
    @Transactional(readOnly = true)
    public Page<Student> getActiveStudents(Pageable pageable) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return studentRepository.findActiveByTenantId(tenantId, pageable);
    }

    /**
     * Get student by ID.
     */
    @Transactional(readOnly = true)
    public Student getStudent(UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return studentRepository.findByTenantIdAndId(tenantId, id)
            .orElseThrow(() -> new EntityNotFoundException("Student", id));
    }

    /**
     * Get students by class group.
     */
    @Transactional(readOnly = true)
    public List<Student> getStudentsByClassGroup(UUID classGroupId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return studentRepository.findActiveByTenantIdAndClassGroupId(tenantId, classGroupId);
    }

    /**
     * Create new student.
     */
    public Student createStudent(CreateStudentCommand command) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        // Check admission number uniqueness
        if (studentRepository.existsByAdmissionNumber(command.admissionNumber())) {
            throw new IllegalStateException("Admission number already exists: " + command.admissionNumber());
        }

        Student student = new Student(
            command.admissionNumber(),
            command.firstName(),
            command.lastName(),
            command.dateOfBirth()
        );
        student.setTenantId(tenantId);
        student.setGender(command.gender());
        student.setBloodGroup(command.bloodGroup());
        student.setClassGroupId(command.classGroupId());

        student = studentRepository.save(student);

        auditService.log(tenantId, null, "CREATE", "Student", student.getId());

        return student;
    }

    /**
     * Update existing student.
     */
    public Student updateStudent(UUID id, UpdateStudentCommand command) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        Student student = studentRepository.findByTenantIdAndId(tenantId, id)
            .orElseThrow(() -> new EntityNotFoundException("Student", id));

        if (command.firstName() != null) student.setFirstName(command.firstName());
        if (command.lastName() != null) student.setLastName(command.lastName());
        if (command.dateOfBirth() != null) student.setDateOfBirth(command.dateOfBirth());
        if (command.gender() != null) student.setGender(command.gender());
        if (command.bloodGroup() != null) student.setBloodGroup(command.bloodGroup());
        if (command.classGroupId() != null) student.setClassGroupId(command.classGroupId());

        student = studentRepository.save(student);

        auditService.log(tenantId, null, "UPDATE", "Student", student.getId());

        return student;
    }

    /**
     * Soft delete student.
     */
    public void deactivateStudent(UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        Student student = studentRepository.findByTenantIdAndId(tenantId, id)
            .orElseThrow(() -> new EntityNotFoundException("Student", id));

        student.setActive(false);
        studentRepository.save(student);

        auditService.log(tenantId, null, "DELETE", "Student", student.getId());
    }

    /**
     * Get guardians for a student.
     */
    @Transactional(readOnly = true)
    public List<Guardian> getStudentGuardians(UUID studentId) {
        // Verify student exists
        getStudent(studentId);
        return guardianRepository.findByStudentId(studentId);
    }

    /**
     * Get count of active students.
     */
    @Transactional(readOnly = true)
    public long countActiveStudents() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        return studentRepository.countActiveByTenantId(tenantId);
    }

    // Command records
    public record CreateStudentCommand(
        String admissionNumber,
        String firstName,
        String lastName,
        java.time.LocalDate dateOfBirth,
        String gender,
        String bloodGroup,
        UUID classGroupId
    ) {}

    public record UpdateStudentCommand(
        String firstName,
        String lastName,
        java.time.LocalDate dateOfBirth,
        String gender,
        String bloodGroup,
        UUID classGroupId
    ) {}
}
