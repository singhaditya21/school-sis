package com.schoolsis.platform.application;

import com.schoolsis.common.exception.AccessDeniedException;
import com.schoolsis.platform.domain.model.User;
import com.schoolsis.platform.domain.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Authentication service handling login, logout, and token refresh.
 */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;

    public AuthService(
            UserRepository userRepository,
            JwtService jwtService,
            PasswordEncoder passwordEncoder,
            AuditService auditService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.auditService = auditService;
    }

    /**
     * Authenticate user and return tokens.
     */
    @Transactional
    public AuthResult login(String email, String password) {
        User user = userRepository.findByEmailAndActiveTrue(email)
                .orElseThrow(() -> new AccessDeniedException("Invalid credentials"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            // TODO: Fix audit_logs entity column mappings
            // auditService.log(user.getTenantId(), user.getId(), "LOGIN_FAILED", "User",
            // user.getId());
            throw new AccessDeniedException("Invalid credentials");
        }

        // Update last login
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        // Generate tokens
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);

        // TODO: Fix audit_logs entity column mappings
        // auditService.log(user.getTenantId(), user.getId(), "LOGIN", "User",
        // user.getId());

        return new AuthResult(
                accessToken,
                refreshToken,
                user.getId(),
                user.getTenantId(),
                user.getRole(),
                user.getEmail(),
                user.getFullName());
    }

    /**
     * Refresh access token using refresh token.
     */
    @Transactional
    public AuthResult refresh(String refreshToken) {
        if (!jwtService.isRefreshToken(refreshToken)) {
            throw new AccessDeniedException("Invalid refresh token");
        }

        var userId = jwtService.getUserId(refreshToken);
        User user = userRepository.findById(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new AccessDeniedException("User not found or inactive"));

        String newAccessToken = jwtService.generateAccessToken(user);
        String newRefreshToken = jwtService.generateRefreshToken(user);

        return new AuthResult(
                newAccessToken,
                newRefreshToken,
                user.getId(),
                user.getTenantId(),
                user.getRole(),
                user.getEmail(),
                user.getFullName());
    }

    /**
     * Get current user from token.
     */
    public User getCurrentUser(String token) {
        var userId = jwtService.getUserId(token);
        return userRepository.findById(userId)
                .orElseThrow(() -> new AccessDeniedException("User not found"));
    }

    /**
     * Result of authentication operations.
     */
    public record AuthResult(
            String accessToken,
            String refreshToken,
            java.util.UUID userId,
            java.util.UUID tenantId,
            com.schoolsis.platform.domain.model.Role role,
            String email,
            String name) {
    }
}
