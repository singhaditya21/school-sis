package com.schoolsis.platform.application;

import com.schoolsis.platform.domain.model.AuditLog;
import com.schoolsis.platform.domain.repository.AuditLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;
import java.util.UUID;

/**
 * Service for creating audit log entries.
 * Logs are written asynchronously to avoid blocking main operations.
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * Log an action without before/after data.
     */
    public void log(UUID tenantId, UUID userId, String action, String entityType, UUID entityId) {
        log(tenantId, userId, action, entityType, entityId, null, null);
    }

    /**
     * Log an action with before/after data.
     */
    @Async
    public void log(
        UUID tenantId,
        UUID userId,
        String action,
        String entityType,
        UUID entityId,
        Map<String, Object> before,
        Map<String, Object> after
    ) {
        try {
            AuditLog auditLog = AuditLog.create(tenantId, userId, action, entityType, entityId);
            auditLog.setBefore(before);
            auditLog.setAfter(after);

            // Extract request info if available
            try {
                var requestAttributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
                if (requestAttributes != null) {
                    var request = requestAttributes.getRequest();
                    auditLog.setIpAddress(getClientIp(request));
                    auditLog.setUserAgent(request.getHeader("User-Agent"));
                }
            } catch (Exception e) {
                // Not in request context, skip
            }

            auditLogRepository.save(auditLog);
            log.debug("Audit log created: {} {} {} {}", action, entityType, entityId, userId);

        } catch (Exception e) {
            log.error("Failed to create audit log", e);
        }
    }

    private String getClientIp(jakarta.servlet.http.HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
