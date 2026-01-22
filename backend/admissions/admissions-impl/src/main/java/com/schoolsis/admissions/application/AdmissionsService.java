package com.schoolsis.admissions.application;

import com.schoolsis.admissions.domain.model.*;
import com.schoolsis.admissions.domain.repository.*;
import com.schoolsis.common.exception.EntityNotFoundException;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@Service
@Transactional
public class AdmissionsService {

    private final AdmissionLeadRepository leadRepository;
    private final ApplicationRepository applicationRepository;
    private final AuditService auditService;

    public AdmissionsService(AdmissionLeadRepository leadRepository, ApplicationRepository applicationRepository, AuditService auditService) {
        this.leadRepository = leadRepository;
        this.applicationRepository = applicationRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public Page<AdmissionLead> getLeads(Pageable pageable) {
        return leadRepository.findByTenantId(TenantContext.getCurrentTenantId(), pageable);
    }

    @Transactional(readOnly = true)
    public AdmissionLead getLead(UUID id) {
        return leadRepository.findByTenantIdAndId(TenantContext.getCurrentTenantId(), id)
            .orElseThrow(() -> new EntityNotFoundException("AdmissionLead", id));
    }

    public AdmissionLead createLead(CreateLeadCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        AdmissionLead lead = new AdmissionLead();
        lead.setTenantId(tenantId);
        lead.setChildName(cmd.childName());
        lead.setDateOfBirth(cmd.dateOfBirth());
        lead.setParentName(cmd.parentName());
        lead.setParentPhone(cmd.parentPhone());
        lead.setParentEmail(cmd.parentEmail());
        lead.setGradeId(cmd.gradeId());
        lead.setSource(cmd.source());
        lead.setNotes(cmd.notes());
        lead = leadRepository.save(lead);
        auditService.log(tenantId, null, "CREATE", "AdmissionLead", lead.getId());
        return lead;
    }

    public AdmissionLead updateLeadStage(UUID id, LeadStage stage) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        AdmissionLead lead = getLead(id);
        lead.setStage(stage);
        lead = leadRepository.save(lead);
        auditService.log(tenantId, null, "UPDATE_STAGE", "AdmissionLead", lead.getId());
        return lead;
    }

    public Application submitApplication(UUID leadId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        AdmissionLead lead = getLead(leadId);
        lead.setStage(LeadStage.APPLIED);
        leadRepository.save(lead);

        Application app = applicationRepository.findByLeadId(leadId).orElseGet(() -> {
            Application newApp = new Application();
            newApp.setLeadId(leadId);
            return newApp;
        });
        app.setStatus(ApplicationStatus.PENDING);
        app.setSubmittedAt(Instant.now());
        app = applicationRepository.save(app);
        auditService.log(tenantId, null, "SUBMIT", "Application", app.getId());
        return app;
    }

    public Application reviewApplication(UUID applicationId, ApplicationStatus status, String notes) {
        Application app = applicationRepository.findById(applicationId)
            .orElseThrow(() -> new EntityNotFoundException("Application", applicationId));
        app.setStatus(status);
        app.setNotes(notes);
        return applicationRepository.save(app);
    }

    @Transactional(readOnly = true)
    public Map<LeadStage, Long> getLeadStats() {
        List<Object[]> rows = leadRepository.countByTenantIdGroupByStage(TenantContext.getCurrentTenantId());
        Map<LeadStage, Long> stats = new EnumMap<>(LeadStage.class);
        for (Object[] row : rows) stats.put((LeadStage) row[0], (Long) row[1]);
        return stats;
    }

    public record CreateLeadCommand(String childName, LocalDate dateOfBirth, String parentName,
        String parentPhone, String parentEmail, UUID gradeId, String source, String notes) {}
}
