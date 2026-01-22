package com.schoolsis.platform.application;

import com.schoolsis.platform.config.JwtProperties;
import com.schoolsis.platform.domain.model.Role;
import com.schoolsis.platform.domain.model.User;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * JWT token generation and validation service.
 */
@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    private final SecretKey secretKey;
    private final JwtProperties jwtProperties;

    public JwtService(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.secret().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * Generate access token for user.
     */
    public String generateAccessToken(User user) {
        Instant now = Instant.now();
        Instant expiry = now.plus(jwtProperties.expiration());

        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("email", user.getEmail())
            .claim("tenantId", user.getTenantId().toString())
            .claim("role", user.getRole().name())
            .claim("name", user.getFullName())
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiry))
            .signWith(secretKey)
            .compact();
    }

    /**
     * Generate refresh token.
     */
    public String generateRefreshToken(User user) {
        Instant now = Instant.now();
        Instant expiry = now.plus(jwtProperties.refreshExpiration());

        return Jwts.builder()
            .subject(user.getId().toString())
            .claim("type", "refresh")
            .issuedAt(Date.from(now))
            .expiration(Date.from(expiry))
            .signWith(secretKey)
            .compact();
    }

    /**
     * Validate token and return claims.
     */
    public Claims validateToken(String token) {
        try {
            return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        } catch (ExpiredJwtException e) {
            log.warn("JWT expired: {}", e.getMessage());
            throw e;
        } catch (JwtException e) {
            log.warn("Invalid JWT: {}", e.getMessage());
            throw e;
        }
    }

    /**
     * Extract user ID from token.
     */
    public UUID getUserId(String token) {
        Claims claims = validateToken(token);
        return UUID.fromString(claims.getSubject());
    }

    /**
     * Extract tenant ID from token.
     */
    public UUID getTenantId(String token) {
        Claims claims = validateToken(token);
        String tenantId = claims.get("tenantId", String.class);
        return tenantId != null ? UUID.fromString(tenantId) : null;
    }

    /**
     * Extract role from token.
     */
    public Role getRole(String token) {
        Claims claims = validateToken(token);
        String role = claims.get("role", String.class);
        return role != null ? Role.valueOf(role) : null;
    }

    /**
     * Check if token is a refresh token.
     */
    public boolean isRefreshToken(String token) {
        try {
            Claims claims = validateToken(token);
            return "refresh".equals(claims.get("type", String.class));
        } catch (JwtException e) {
            return false;
        }
    }

    /**
     * Check if token is valid (not expired, properly signed).
     */
    public boolean isValid(String token) {
        try {
            validateToken(token);
            return true;
        } catch (JwtException e) {
            return false;
        }
    }
}
