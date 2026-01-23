package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.domain.model.Role;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST controller for role and permission management.
 */
@RestController
@RequestMapping("/api/v1/roles")
public class RoleController {

        // In-memory permission storage (can be moved to database later)
        private final Map<Role, Set<String>> rolePermissions = new EnumMap<>(Role.class);

        public RoleController() {
                initializeDefaultPermissions();
        }

        private void initializeDefaultPermissions() {
                // Super Admin - all permissions
                rolePermissions.put(Role.SUPER_ADMIN, new HashSet<>(Arrays.asList(
                                "dashboard.view", "dashboard.analytics",
                                "students.view", "students.create", "students.edit", "students.delete",
                                "fees.view", "fees.collect", "fees.reports", "fees.configure",
                                "users.view", "users.create", "users.edit", "users.delete",
                                "exams.view", "exams.manage", "exams.marks",
                                "settings.view", "settings.edit")));

                // School Admin
                rolePermissions.put(Role.SCHOOL_ADMIN, new HashSet<>(Arrays.asList(
                                "dashboard.view", "dashboard.analytics",
                                "students.view", "students.create", "students.edit",
                                "fees.view", "fees.collect", "fees.reports", "fees.configure",
                                "users.view", "users.create", "users.edit",
                                "exams.view", "exams.manage", "exams.marks",
                                "settings.view", "settings.edit")));

                // Principal
                rolePermissions.put(Role.PRINCIPAL, new HashSet<>(Arrays.asList(
                                "dashboard.view", "dashboard.analytics",
                                "students.view", "students.edit",
                                "fees.view", "fees.reports",
                                "exams.view", "exams.manage",
                                "settings.view")));

                // Accountant
                rolePermissions.put(Role.ACCOUNTANT, new HashSet<>(Arrays.asList(
                                "dashboard.view",
                                "students.view",
                                "fees.view", "fees.collect", "fees.reports", "fees.configure")));

                // Teacher
                rolePermissions.put(Role.TEACHER, new HashSet<>(Arrays.asList(
                                "dashboard.view",
                                "students.view",
                                "exams.view", "exams.marks")));

                // Admission Counselor
                rolePermissions.put(Role.ADMISSION_COUNSELOR, new HashSet<>(Arrays.asList(
                                "dashboard.view",
                                "students.view", "students.create")));

                // Transport Manager
                rolePermissions.put(Role.TRANSPORT_MANAGER, new HashSet<>(Arrays.asList(
                                "dashboard.view",
                                "students.view")));

                // Parent
                rolePermissions.put(Role.PARENT, new HashSet<>(List.of("dashboard.view")));

                // Student
                rolePermissions.put(Role.STUDENT, new HashSet<>(List.of("dashboard.view")));
        }

        /**
         * Get all roles with their permissions count.
         */
        @GetMapping
        public ResponseEntity<ApiResponse<List<RoleSummary>>> getAllRoles() {
                List<RoleSummary> roles = Arrays.stream(Role.values())
                                .map(role -> new RoleSummary(
                                                role.name(),
                                                formatDisplayName(role),
                                                rolePermissions.getOrDefault(role, Set.of()).size(),
                                                role.isAdminRole(),
                                                role.isStaffRole()))
                                .toList();
                return ResponseEntity.ok(ApiResponse.ok(roles));
        }

        /**
         * Get permissions for a specific role.
         */
        @GetMapping("/{role}/permissions")
        public ResponseEntity<ApiResponse<RolePermissions>> getRolePermissions(@PathVariable String role) {
                try {
                        Role roleEnum = Role.valueOf(role.toUpperCase());
                        Set<String> permissions = rolePermissions.getOrDefault(roleEnum, Set.of());
                        return ResponseEntity.ok(ApiResponse.ok(new RolePermissions(
                                        roleEnum.name(),
                                        formatDisplayName(roleEnum),
                                        new ArrayList<>(permissions))));
                } catch (IllegalArgumentException e) {
                        return ResponseEntity.badRequest()
                                        .body(ApiResponse.error("INVALID_ROLE", "Role not found: " + role));
                }
        }

        /**
         * Update permissions for a role.
         */
        @PutMapping("/{role}/permissions")
        public ResponseEntity<ApiResponse<RolePermissions>> updateRolePermissions(
                        @PathVariable String role,
                        @RequestBody UpdatePermissionsRequest request) {
                try {
                        Role roleEnum = Role.valueOf(role.toUpperCase());

                        // Super Admin permissions cannot be modified
                        if (roleEnum == Role.SUPER_ADMIN) {
                                return ResponseEntity.badRequest()
                                                .body(ApiResponse.error("FORBIDDEN",
                                                                "Super Admin permissions cannot be modified"));
                        }

                        rolePermissions.put(roleEnum, new HashSet<>(request.permissions()));

                        return ResponseEntity.ok(ApiResponse.ok(new RolePermissions(
                                        roleEnum.name(),
                                        formatDisplayName(roleEnum),
                                        request.permissions())));
                } catch (IllegalArgumentException e) {
                        return ResponseEntity.badRequest()
                                        .body(ApiResponse.error("INVALID_ROLE", "Role not found: " + role));
                }
        }

        /**
         * Get all available permissions.
         */
        @GetMapping("/permissions")
        public ResponseEntity<ApiResponse<List<PermissionInfo>>> getAllPermissions() {
                List<PermissionInfo> permissions = Arrays.asList(
                                // Dashboard
                                new PermissionInfo("dashboard.view", "View Dashboard", "Dashboard"),
                                new PermissionInfo("dashboard.analytics", "View Analytics", "Dashboard"),
                                // Students
                                new PermissionInfo("students.view", "View Students", "Students"),
                                new PermissionInfo("students.create", "Create Students", "Students"),
                                new PermissionInfo("students.edit", "Edit Students", "Students"),
                                new PermissionInfo("students.delete", "Delete Students", "Students"),
                                // Fees
                                new PermissionInfo("fees.view", "View Fees", "Fees"),
                                new PermissionInfo("fees.collect", "Collect Fees", "Fees"),
                                new PermissionInfo("fees.reports", "Fee Reports", "Fees"),
                                new PermissionInfo("fees.configure", "Configure Fees", "Fees"),
                                // Users
                                new PermissionInfo("users.view", "View Users", "Users"),
                                new PermissionInfo("users.create", "Create Users", "Users"),
                                new PermissionInfo("users.edit", "Edit Users", "Users"),
                                new PermissionInfo("users.delete", "Delete Users", "Users"),
                                // Exams
                                new PermissionInfo("exams.view", "View Exams", "Exams"),
                                new PermissionInfo("exams.manage", "Manage Exams", "Exams"),
                                new PermissionInfo("exams.marks", "Enter Marks", "Exams"),
                                // Settings
                                new PermissionInfo("settings.view", "View Settings", "Settings"),
                                new PermissionInfo("settings.edit", "Edit Settings", "Settings"));
                return ResponseEntity.ok(ApiResponse.ok(permissions));
        }

        private String formatDisplayName(Role role) {
                return switch (role) {
                        case SUPER_ADMIN -> "Super Admin";
                        case SCHOOL_ADMIN -> "School Admin";
                        case PRINCIPAL -> "Principal";
                        case ACCOUNTANT -> "Accountant";
                        case ADMISSION_COUNSELOR -> "Admission Counselor";
                        case TEACHER -> "Teacher";
                        case TRANSPORT_MANAGER -> "Transport Manager";
                        case PARENT -> "Parent";
                        case STUDENT -> "Student";
                };
        }

        // Records
        public record RoleSummary(
                        String role,
                        String displayName,
                        int permissionCount,
                        boolean isAdmin,
                        boolean isStaff) {
        }

        public record RolePermissions(
                        String role,
                        String displayName,
                        List<String> permissions) {
        }

        public record UpdatePermissionsRequest(List<String> permissions) {
        }

        public record PermissionInfo(
                        String id,
                        String name,
                        String module) {
        }
}
