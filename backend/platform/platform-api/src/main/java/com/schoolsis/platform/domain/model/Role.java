package com.schoolsis.platform.domain.model;

/**
 * User roles matching the TypeScript ROLES constant.
 */
public enum Role {
    SUPER_ADMIN,
    SCHOOL_ADMIN,
    PRINCIPAL,
    ACCOUNTANT,
    ADMISSION_COUNSELOR,
    TEACHER,
    TRANSPORT_MANAGER,
    PARENT,
    STUDENT;

    public boolean isAdminRole() {
        return this == SUPER_ADMIN || this == SCHOOL_ADMIN || this == PRINCIPAL || this == ACCOUNTANT;
    }

    public boolean isStaffRole() {
        return this != PARENT && this != STUDENT;
    }
}
