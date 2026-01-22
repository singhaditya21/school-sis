package com.schoolsis.platform.infrastructure;

import java.util.UUID;

/**
 * Thread-local context for tenant resolution.
 * Set by TenantFilter, used by repositories and services.
 */
public final class TenantContext {

    private static final ThreadLocal<UUID> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {}

    public static UUID getCurrentTenantId() {
        UUID tenantId = CURRENT_TENANT.get();
        if (tenantId == null) {
            throw new IllegalStateException("Tenant context not set for current request");
        }
        return tenantId;
    }

    public static UUID getCurrentTenantIdOrNull() {
        return CURRENT_TENANT.get();
    }

    public static void setCurrentTenantId(UUID tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}
