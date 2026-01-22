package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.application.AuthService;
import com.schoolsis.platform.application.AuthService.AuthResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Authentication controller.
 * Handles login, logout, refresh, and current user endpoints.
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /**
     * Login with email and password.
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResult result = authService.login(request.email(), request.password());

        return ResponseEntity.ok(ApiResponse.ok(new LoginResponse(
            result.accessToken(),
            result.refreshToken(),
            result.userId().toString(),
            result.tenantId() != null ? result.tenantId().toString() : null,
            result.role().name(),
            result.email(),
            result.name()
        )));
    }

    /**
     * Refresh access token.
     */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<LoginResponse>> refresh(@Valid @RequestBody RefreshRequest request) {
        AuthResult result = authService.refresh(request.refreshToken());

        return ResponseEntity.ok(ApiResponse.ok(new LoginResponse(
            result.accessToken(),
            result.refreshToken(),
            result.userId().toString(),
            result.tenantId() != null ? result.tenantId().toString() : null,
            result.role().name(),
            result.email(),
            result.name()
        )));
    }

    /**
     * Get current authenticated user.
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> me(
        @RequestHeader("Authorization") String authHeader
    ) {
        String token = authHeader.startsWith("Bearer ") 
            ? authHeader.substring(7) 
            : authHeader;

        var user = authService.getCurrentUser(token);

        return ResponseEntity.ok(ApiResponse.ok(new UserResponse(
            user.getId().toString(),
            user.getTenantId() != null ? user.getTenantId().toString() : null,
            user.getEmail(),
            user.getFirstName(),
            user.getLastName(),
            user.getRole().name()
        )));
    }

    // Request/Response records
    public record LoginRequest(
        @NotBlank @Email String email,
        @NotBlank String password
    ) {}

    public record RefreshRequest(
        @NotBlank String refreshToken
    ) {}

    public record LoginResponse(
        String accessToken,
        String refreshToken,
        String userId,
        String tenantId,
        String role,
        String email,
        String name
    ) {}

    public record UserResponse(
        String id,
        String tenantId,
        String email,
        String firstName,
        String lastName,
        String role
    ) {}
}
