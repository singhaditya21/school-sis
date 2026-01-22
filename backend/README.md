# School SIS - Java Backend

Multi-tenant School Information System migrated from TypeScript/Next.js to Java Spring Boot.

## Tech Stack

| Component   | Version            |
| ----------- | ------------------ |
| Java        | 21 LTS             |
| Spring Boot | 3.2.x              |
| Database    | PostgreSQL 15+     |
| ORM         | Hibernate 6 / JPA  |
| Migrations  | Flyway             |
| Build       | Gradle 8.5         |

## Quick Start

```bash
# Build
./gradlew build

# Run
./gradlew :app:bootRun

# Test
./gradlew test

# Build JAR
./gradlew :app:bootJar
```

## Module Structure

```text
school-sis-java/
├── common/                 # Shared utilities, base classes
├── platform/               # Auth, RBAC, Audit, Tenant
├── students/               # Student 360, Guardians
├── fees/                   # Fee Plans, Invoices, Payments
├── attendance/             # Daily/Period Attendance
├── exams/                  # Exams, Marks, Report Cards
├── admissions/             # CRM, Applications
├── timetable/              # Periods, Substitution
├── transport/              # Vehicles, Routes
├── communication/          # Messaging, Templates
└── app/                    # Main Spring Boot app
```

## API Documentation

Once running: <http://localhost:8080/swagger-ui>

## Environment Variables

| Variable     | Required | Default                                      |
| ------------ | -------- | -------------------------------------------- |
| DATABASE_URL | Yes      | jdbc:postgresql://localhost:5432/school_sis  |
| JWT_SECRET   | Yes      | -                                            |
| PORT         | No       | 8080                                         |

## Migration Status

See `/MIGRATION_SEQUENCE.md` for endpoint-by-endpoint migration plan.
