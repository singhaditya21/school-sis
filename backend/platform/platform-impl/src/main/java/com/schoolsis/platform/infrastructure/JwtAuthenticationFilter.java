package com.schoolsis.platform.infrastructure;

import com.schoolsis.platform.application.JwtService;
import com.schoolsis.platform.domain.model.Role;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * JWT authentication filter.
 * Extracts JWT from Authorization header or cookie, validates it,
 * and sets up SecurityContext and TenantContext.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String AUTH_HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String AUTH_COOKIE = "school-sis-token";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null) {
            try {
                var claims = jwtService.validateToken(token);

                UUID userId = UUID.fromString(claims.getSubject());
                String tenantIdStr = claims.get("tenantId", String.class);
                UUID tenantId = tenantIdStr != null ? UUID.fromString(tenantIdStr) : null;
                String roleStr = claims.get("role", String.class);
                Role role = roleStr != null ? Role.valueOf(roleStr) : null;

                // Set tenant context
                if (tenantId != null) {
                    TenantContext.setCurrentTenantId(tenantId);
                }

                // Set MDC for logging
                MDC.put("userId", userId.toString());
                if (tenantId != null) {
                    MDC.put("tenantId", tenantId.toString());
                }
                MDC.put("requestId", UUID.randomUUID().toString());

                // Create authentication token
                List<SimpleGrantedAuthority> authorities = role != null
                        ? Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
                        : Collections.emptyList();

                var authentication = new UsernamePasswordAuthenticationToken(
                        new AuthenticatedUser(userId, tenantId, role, claims.get("email", String.class)),
                        null,
                        authorities);

                SecurityContextHolder.getContext().setAuthentication(authentication);
                log.debug("Authenticated user {} with role {}", userId, role);

            } catch (JwtException e) {
                log.debug("JWT validation failed: {}", e.getMessage());
                // Continue without authentication - public endpoints will work
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            MDC.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        // Check Authorization header first
        String header = request.getHeader(AUTH_HEADER);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }

        // Check cookie as fallback
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (AUTH_COOKIE.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }

        return null;
    }

    /**
     * Principal object containing authenticated user details.
     */
    public record AuthenticatedUser(
            UUID userId,
            UUID tenantId,
            Role role,
            String email) {
    }
}
