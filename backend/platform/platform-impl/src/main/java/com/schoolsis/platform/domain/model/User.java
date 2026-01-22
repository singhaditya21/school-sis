package com.schoolsis.platform.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * User entity - represents a user account in the system.
 * Maps to the 'users' table from the Prisma schema.
 */
@Entity
@Table(name = "users", indexes = {
        @Index(columnList = "tenantId, role"),
        @Index(columnList = "tenantId, isActive")
})
public class User extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "\"passwordHash\"", nullable = false)
    private String passwordHash;

    @Column(name = "\"firstName\"", nullable = false)
    private String firstName;

    @Column(name = "\"lastName\"", nullable = false)
    private String lastName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(name = "\"isActive\"")
    private boolean active = true;

    @Column(name = "\"lastLoginAt\"")
    private Instant lastLoginAt;

    @CreationTimestamp
    @Column(name = "\"createdAt\"", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "\"updatedAt\"")
    private Instant updatedAt;

    // Relationship to Tenant
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "\"tenantId\"", insertable = false, updatable = false)
    private Tenant tenant;

    // Constructors
    public User() {
    }

    public User(String email, String passwordHash, String firstName, String lastName, Role role) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.firstName = firstName;
        this.lastName = lastName;
        this.role = role;
    }

    // Business methods
    public String getFullName() {
        return firstName + " " + lastName;
    }

    public boolean isAdmin() {
        return role != null && role.isAdminRole();
    }

    public boolean isStaff() {
        return role != null && role.isStaffRole();
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Tenant getTenant() {
        return tenant;
    }
}
