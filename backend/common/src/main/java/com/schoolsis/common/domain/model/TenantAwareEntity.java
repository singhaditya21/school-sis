package com.schoolsis.common.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import java.util.UUID;

/**
 * Base class for all entities that belong to a tenant.
 * Provides tenant_id column and ensures multi-tenant isolation.
 */
@MappedSuperclass
public abstract class TenantAwareEntity {

    @Column(name = "tenant_id", updatable = false)
    private UUID tenantId;

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }
}
