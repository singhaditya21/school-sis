package com.schoolsis.admissions.api.v1;

import com.schoolsis.admissions.application.AdmissionsService;
import com.schoolsis.admissions.application.AdmissionsService.CreateLeadCommand;
import com.schoolsis.admissions.domain.model.*;
import com.schoolsis.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admissions")
public class AdmissionsController {

    private final AdmissionsService admissionsService;

    public AdmissionsController(AdmissionsService admissionsService) {
        this.admissionsService = admissionsService;
    }

    @GetMapping("/leads")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR')")
    public ApiResponse<Page<LeadResponse>> getLeads(Pageable pageable) {
        return ApiResponse.ok(admissionsService.getLeads(pageable).map(this::toResponse));
    }

    @GetMapping("/leads/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR')")
    public ApiResponse<LeadResponse> getLead(@PathVariable UUID id) {
        return ApiResponse.ok(toResponse(admissionsService.getLead(id)));
    }

    @PostMapping("/leads")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR')")
    public ApiResponse<LeadResponse> createLead(@Valid @RequestBody CreateLeadRequest req) {
        AdmissionLead lead = admissionsService.createLead(new CreateLeadCommand(req.childName(), req.dateOfBirth(),
            req.parentName(), req.parentPhone(), req.parentEmail(), req.gradeId(), req.source(), req.notes()));
        return ApiResponse.ok(toResponse(lead));
    }

    @PutMapping("/leads/{id}/stage")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMISSION_COUNSELOR')")
    public ApiResponse<LeadResponse> updateLeadStage(@PathVariable UUID id, @RequestBody UpdateStageRequest req) {
        return ApiResponse.ok(toResponse(admissionsService.updateLeadStage(id, req.stage())));
    }

    @PostMapping("/leads/{id}/apply")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMISSION_COUNSELOR')")
    public ApiResponse<ApplicationResponse> submitApplication(@PathVariable UUID id) {
        return ApiResponse.ok(toAppResponse(admissionsService.submitApplication(id)));
    }

    @PutMapping("/applications/{id}/review")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<ApplicationResponse> reviewApplication(@PathVariable UUID id, @RequestBody ReviewRequest req) {
        return ApiResponse.ok(toAppResponse(admissionsService.reviewApplication(id, req.status(), req.notes())));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSION_COUNSELOR')")
    public ApiResponse<Map<LeadStage, Long>> getStats() {
        return ApiResponse.ok(admissionsService.getLeadStats());
    }

    private LeadResponse toResponse(AdmissionLead l) {
        return new LeadResponse(l.getId(), l.getChildName(), l.getDateOfBirth(), l.getParentName(),
            l.getParentPhone(), l.getParentEmail(), l.getGradeId(), l.getStage(), l.getSource(), l.getCreatedAt());
    }

    private ApplicationResponse toAppResponse(Application a) {
        return new ApplicationResponse(a.getId(), a.getLeadId(), a.getStatus(), a.getSubmittedAt(), a.getNotes());
    }

    public record CreateLeadRequest(@NotBlank String childName, LocalDate dateOfBirth, @NotBlank String parentName,
        @NotBlank String parentPhone, String parentEmail, UUID gradeId, String source, String notes) {}
    public record UpdateStageRequest(@NotNull LeadStage stage) {}
    public record ReviewRequest(@NotNull ApplicationStatus status, String notes) {}
    public record LeadResponse(UUID id, String childName, LocalDate dateOfBirth, String parentName,
        String parentPhone, String parentEmail, UUID gradeId, LeadStage stage, String source, Instant createdAt) {}
    public record ApplicationResponse(UUID id, UUID leadId, ApplicationStatus status, Instant submittedAt, String notes) {}
}
