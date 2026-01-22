# Architecture Decisions Record (ADR)

## Overview

This document captures the technology choices, patterns, and standards for the Java migration of the School Information System.

---

## ADR-001: Java Version

**Decision:** Java 21 LTS

**Justification:**

- Long-term support until 2031
- Virtual threads (Project Loom) for high concurrency
- Record types for DTOs
- Pattern matching for cleaner code
- Latest Spring Boot 3.x requires Java 17+

---

## ADR-002: Framework Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Core Framework** | Spring Boot 3.2+ | Industry standard, excellent ecosystem |
| **Web Layer** | Spring Web MVC | REST APIs, proven stability |
| **Security** | Spring Security 6 | JWT + session support, RBAC |
| **Persistence** | Spring Data JPA | Prisma → JPA mapping is natural |
| **ORM** | Hibernate 6 | Mature, PostgreSQL optimized |
| **Database** | PostgreSQL 15+ | Keep existing DB |
| **Migrations** | Flyway | SQL-based, Prisma-compatible |
| **Validation** | Jakarta Validation | Annotation-based like Zod |
| **API Docs** | SpringDoc OpenAPI | Auto-generated Swagger UI |
| **Build** | Gradle (Kotlin DSL) | Faster than Maven, multi-module support |

---

## ADR-003: Multi-Module Structure

```
school-sis-java/
├── build.gradle.kts           # Root build
├── settings.gradle.kts
├── platform/                   # Core platform services
│   ├── platform-api/          # DTOs, interfaces
│   └── platform-impl/         # Implementation
├── students/
│   ├── students-api/
│   └── students-impl/
├── fees/
├── attendance/
├── exams/
├── admissions/
├── timetable/
├── transport/
├── communication/
├── common/                     # Shared utilities
└── app/                        # Main Spring Boot app
```

**Rationale:**

- Enforces module boundaries
- api/impl split prevents circular dependencies
- Easy to extract microservices later

---

## ADR-004: Package Structure (per module)

```
com.schoolsis.{module}/
├── api/                        # REST controllers
│   └── v1/                    # Versioned endpoints
├── application/               # Use cases, services
├── domain/                    # Entities, value objects
│   ├── model/
│   └── repository/           # Repository interfaces
├── infrastructure/            # JPA repos, external calls
│   ├── persistence/
│   └── integration/
└── config/                    # Module configuration
```

**Pattern:** Clean Architecture / Hexagonal

---

## ADR-005: DTO vs Entity Separation

**Rule:** Never expose JPA entities in API responses.

```java
// Entity (internal)
@Entity
@Table(name = "students")
public class Student {
    @Id private UUID id;
    @Column(name = "tenant_id") private UUID tenantId;
    private String firstName;
    // ...
}

// DTO (API layer)
public record StudentResponse(
    UUID id,
    String firstName,
    String lastName,
    String admissionNumber,
    String className
) {}

// Mapper
@Mapper(componentModel = "spring")
public interface StudentMapper {
    StudentResponse toResponse(Student entity);
}
```

**Tool:** MapStruct for compile-time mapping

---

## ADR-006: Error Handling

**Standard Response Envelope:**

```java
public record ApiResponse<T>(
    boolean success,
    T data,
    ApiError error,
    Instant timestamp
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, Instant.now());
    }
    
    public static <T> ApiResponse<T> error(ApiError error) {
        return new ApiResponse<>(false, null, error, Instant.now());
    }
}

public record ApiError(
    String code,
    String message,
    Map<String, String> details
) {}
```

**Exception Handling:**

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(EntityNotFoundException.class)
    @ResponseStatus(NOT_FOUND)
    public ApiResponse<?> handleNotFound(EntityNotFoundException ex) {
        return ApiResponse.error(new ApiError("NOT_FOUND", ex.getMessage(), null));
    }
    
    @ExceptionHandler(AccessDeniedException.class)
    @ResponseStatus(FORBIDDEN)
    public ApiResponse<?> handleForbidden(AccessDeniedException ex) {
        return ApiResponse.error(new ApiError("FORBIDDEN", "Access denied", null));
    }
}
```

---

## ADR-007: Multi-Tenancy Strategy

**Approach:** Discriminator column (`tenant_id`)

```java
@MappedSuperclass
public abstract class TenantAwareEntity {
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;
}

// All tenant-scoped entities extend this
@Entity
public class Student extends TenantAwareEntity { ... }
```

**Enforcement:**

1. **Request Context:** `TenantContext.getCurrentTenantId()`
2. **Repository Level:** Custom base repository with tenant filtering
3. **Optional:** Hibernate filters for row-level security

```java
public interface TenantAwareRepository<T, ID> extends JpaRepository<T, ID> {
    @Query("SELECT e FROM #{#entityName} e WHERE e.tenantId = :tenantId")
    List<T> findAllByTenantId(UUID tenantId);
}
```

---

## ADR-008: Authentication & Sessions

**Approach:** JWT access tokens + refresh tokens

| Aspect | Decision |
|--------|----------|
| **Token Type** | JWT (RS256) |
| **Access Token TTL** | 15 minutes |
| **Refresh Token TTL** | 7 days |
| **Storage** | HttpOnly cookies |
| **Claims** | userId, tenantId, role, permissions |

**Migration Note:** Current iron-session uses symmetric encryption. Java will use asymmetric JWT. Force re-login on migration.

---

## ADR-009: RBAC Implementation

```java
public enum Role {
    SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, ACCOUNTANT,
    ADMISSION_COUNSELOR, TEACHER, TRANSPORT_MANAGER,
    PARENT, STUDENT
}

public enum Permission {
    FEES_READ, FEES_WRITE, FEES_MANAGE,
    STUDENTS_READ, STUDENTS_WRITE,
    ATTENDANCE_READ, ATTENDANCE_WRITE,
    EXAMS_READ, EXAMS_WRITE, EXAMS_MANAGE,
    // ...
}

// Method-level security
@PreAuthorize("hasPermission('FEES_WRITE')")
public PaymentResponse recordPayment(PaymentRequest request) { ... }
```

---

## ADR-010: Audit Logging

```java
@Entity
@Table(name = "audit_logs")
public class AuditLog {
    @Id private UUID id;
    private UUID tenantId;
    private UUID userId;
    private String action;        // CREATE, UPDATE, DELETE
    private String entityType;    // Student, Invoice, Payment
    private UUID entityId;
    @Type(JsonType.class)
    private Map<String, Object> before;
    @Type(JsonType.class)
    private Map<String, Object> after;
    private String ipAddress;
    private Instant timestamp;
}

// AOP-based auto-capture
@Audited(action = "CREATE")
public Student createStudent(CreateStudentRequest request) { ... }
```

---

## ADR-011: Observability

| Aspect | Tool |
|--------|------|
| **Metrics** | Micrometer + Prometheus |
| **Tracing** | OpenTelemetry + Jaeger |
| **Logging** | SLF4J + Logback (JSON) |
| **Correlation** | MDC with request ID |
| **Health** | Spring Actuator |

```java
// Logging with correlation
MDC.put("tenantId", tenantContext.getTenantId());
MDC.put("userId", securityContext.getUserId());
MDC.put("requestId", UUID.randomUUID().toString());
log.info("Processing payment for invoice {}", invoiceId);
```

---

## ADR-012: Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| **Unit** | JUnit 5 + Mockito | 80%+ |
| **Integration** | Testcontainers | Key flows |
| **API** | MockMvc / WebTestClient | All endpoints |
| **Contract** | Spring Cloud Contract | Parity with TS |
| **E2E** | Playwright (reuse existing) | Critical paths |

---

## ADR-013: Feature Flags

**Tool:** Togglz (or custom)

```java
public enum Features implements Feature {
    @EnabledByDefault
    JAVA_FEES_MODULE,
    
    JAVA_ATTENDANCE_MODULE,
    
    JAVA_EXAMS_MODULE
}

// Usage
if (featureManager.isActive(Features.JAVA_FEES_MODULE)) {
    // Route to Java implementation
} else {
    // Proxy to existing TS implementation
}
```

---

## Tradeoffs Summary

| Decision | Pros | Cons |
|----------|------|------|
| Spring Boot | Ecosystem, hiring, support | Heavier than Quarkus |
| JPA/Hibernate | Prisma-like ORM | N+1 risk, learning curve |
| Flyway | SQL migrations | No rollback auto-gen |
| JWT over Session | Stateless, scalable | Token revocation complexity |
| Gradle | Fast builds | Less common than Maven |

---

## Next Steps

With architecture decisions approved:

1. ✅ ARCHITECTURE_DECISIONS.md (this document)
2. → CONSTRUCT_MAPPING_GUIDE.md
3. → MIGRATION_SEQUENCE.md
4. → Java repo scaffold
