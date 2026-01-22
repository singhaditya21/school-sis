package com.schoolsis.platform.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * JWT configuration properties.
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
    String secret,
    Duration expiration,
    Duration refreshExpiration
) {
    public JwtProperties {
        if (expiration == null) expiration = Duration.ofMinutes(15);
        if (refreshExpiration == null) refreshExpiration = Duration.ofDays(7);
    }
}
