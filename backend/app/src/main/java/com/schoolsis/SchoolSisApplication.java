package com.schoolsis;

import com.schoolsis.platform.config.JwtProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * School Information System - Java Application.
 * Multi-tenant SIS for the Indian education market.
 */
@SpringBootApplication
@EnableConfigurationProperties(JwtProperties.class)
public class SchoolSisApplication {

    public static void main(String[] args) {
        SpringApplication.run(SchoolSisApplication.class, args);
    }
}
