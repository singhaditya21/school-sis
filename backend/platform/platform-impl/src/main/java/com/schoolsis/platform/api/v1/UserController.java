package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.application.UserService;
import com.schoolsis.platform.application.UserService.CreateUserCommand;
import com.schoolsis.platform.application.UserService.UpdateUserCommand;
import com.schoolsis.platform.domain.model.Role;
import com.schoolsis.platform.domain.model.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * REST controller for user management.
 */
@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    /**
     * Get all users (paginated).
     */
    @GetMapping
    public ResponseEntity<ApiResponse<Page<UserResponse>>> getAllUsers(
            @PageableDefault(size = 20) Pageable pageable) {
        Page<UserResponse> users = userService.getAllUsers(pageable)
                .map(this::toResponse);
        return ResponseEntity.ok(ApiResponse.ok(users));
    }

    /**
     * Get user by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable UUID id) {
        return userService.getUserById(id)
                .map(user -> ResponseEntity.ok(ApiResponse.ok(toResponse(user))))
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(ApiResponse.error("USER_NOT_FOUND", "User not found")));
    }

    /**
     * Create a new user.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            @Valid @RequestBody CreateUserRequest request) {
        try {
            User user = userService.createUser(new CreateUserCommand(
                    request.email(),
                    request.password(),
                    request.firstName(),
                    request.lastName(),
                    request.role(),
                    request.tenantId()));
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(ApiResponse.ok(toResponse(user)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_ERROR", e.getMessage()));
        }
    }

    /**
     * Update an existing user.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateUser(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateUserRequest request) {
        try {
            User user = userService.updateUser(id, new UpdateUserCommand(
                    request.firstName(),
                    request.lastName(),
                    request.role(),
                    request.active()));
            return ResponseEntity.ok(ApiResponse.ok(toResponse(user)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("USER_NOT_FOUND", e.getMessage()));
        }
    }

    /**
     * Toggle user active status.
     */
    @PatchMapping("/{id}/status")
    public ResponseEntity<ApiResponse<UserResponse>> toggleUserStatus(
            @PathVariable UUID id,
            @RequestBody ToggleStatusRequest request) {
        try {
            if (request.active()) {
                userService.activateUser(id);
            } else {
                userService.deactivateUser(id);
            }
            return userService.getUserById(id)
                    .map(user -> ResponseEntity.ok(ApiResponse.ok(toResponse(user))))
                    .orElse(ResponseEntity.notFound().build());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("USER_NOT_FOUND", e.getMessage()));
        }
    }

    /**
     * Reset user password.
     */
    @PostMapping("/{id}/reset-password")
    public ResponseEntity<ApiResponse<PasswordResetResponse>> resetPassword(@PathVariable UUID id) {
        try {
            String tempPassword = userService.resetPassword(id);
            return ResponseEntity.ok(ApiResponse.ok(new PasswordResetResponse(
                    id.toString(),
                    tempPassword,
                    "Password has been reset. Please share the temporary password securely.")));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("USER_NOT_FOUND", e.getMessage()));
        }
    }

    /**
     * Delete (deactivate) a user.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable UUID id) {
        try {
            userService.deactivateUser(id);
            return ResponseEntity.ok(ApiResponse.ok(null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("USER_NOT_FOUND", e.getMessage()));
        }
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId().toString(),
                user.getTenantId() != null ? user.getTenantId().toString() : null,
                user.getEmail(),
                user.getFirstName(),
                user.getLastName(),
                user.getRole().name(),
                user.isActive(),
                user.getCreatedAt() != null ? user.getCreatedAt().toString() : null,
                user.getLastLoginAt() != null ? user.getLastLoginAt().toString() : null);
    }

    // Request/Response records
    public record CreateUserRequest(
            @NotBlank @Email String email,
            @NotBlank String password,
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotNull Role role,
            @NotNull UUID tenantId) {
    }

    public record UpdateUserRequest(
            String firstName,
            String lastName,
            Role role,
            Boolean active) {
    }

    public record ToggleStatusRequest(boolean active) {
    }

    public record UserResponse(
            String id,
            String tenantId,
            String email,
            String firstName,
            String lastName,
            String role,
            boolean active,
            String createdAt,
            String lastLoginAt) {
    }

    public record PasswordResetResponse(
            String userId,
            String temporaryPassword,
            String message) {
    }
}
