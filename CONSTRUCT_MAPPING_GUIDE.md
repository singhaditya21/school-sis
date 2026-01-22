# Construct Mapping Guide: TypeScript → Java

This guide provides concrete before/after examples from the actual SIS codebase, mapping TypeScript/Next.js patterns to their Java equivalents.

---

## 1. Data Models: Prisma → JPA Entities

### Before (Prisma schema.prisma)

```prisma
model Student {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @db.Uuid
  classGroupId    String?  @db.Uuid
  admissionNumber String   @unique
  firstName       String
  lastName        String
  dateOfBirth     DateTime
  gender          String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  classGroup ClassGroup? @relation(fields: [classGroupId], references: [id])
  guardianLinks StudentGuardianLink[]
  invoices      Invoice[]

  @@index([tenantId, admissionNumber])
  @@map("students")
}
```

### After (Java Entity)

```java
@Entity
@Table(name = "students", indexes = {
    @Index(columnList = "tenant_id, admission_number")
})
@Getter @Setter
@NoArgsConstructor
public class Student extends TenantAwareEntity implements Auditable {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "admission_number", unique = true, nullable = false)
    private String admissionNumber;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    private String gender;

    @Column(name = "is_active")
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    // Relations
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "class_group_id")
    private ClassGroup classGroup;

    @OneToMany(mappedBy = "student", cascade = CascadeType.ALL)
    private Set<StudentGuardianLink> guardianLinks = new HashSet<>();

    @OneToMany(mappedBy = "student")
    private Set<Invoice> invoices = new HashSet<>();
}
```

---

## 2. DTOs: TypeScript Types → Java Records

### Before (TypeScript inferred from Prisma)

```typescript
// Inferred from Prisma queries
type StudentWithClass = Prisma.StudentGetPayload<{
    include: {
        classGroup: { include: { section: { include: { grade: true } } } }
    }
}>;

// Manual DTO
interface StudentResponse {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    className: string;
    dateOfBirth: string;
}
```

### After (Java Record)

```java
public record StudentResponse(
    UUID id,
    String firstName,
    String lastName,
    String admissionNumber,
    String className,
    LocalDate dateOfBirth,
    boolean active
) {}

public record CreateStudentRequest(
    @NotBlank String firstName,
    @NotBlank String lastName,
    @NotBlank String admissionNumber,
    @NotNull LocalDate dateOfBirth,
    String gender,
    UUID classGroupId
) {}

// MapStruct mapper
@Mapper(componentModel = "spring")
public interface StudentMapper {
    @Mapping(target = "className", expression = "java(getClassName(student))")
    StudentResponse toResponse(Student student);
    
    Student toEntity(CreateStudentRequest request);
    
    default String getClassName(Student student) {
        if (student.getClassGroup() == null) return null;
        var cg = student.getClassGroup();
        return cg.getSection().getGrade().getName() + " - " + cg.getSection().getName();
    }
}
```

---

## 3. Validation: Zod/Manual → Jakarta Validation

### Before (TypeScript - manual validation)

```typescript
// src/lib/actions/forms.ts
const firstName = formData.get('firstName') as string;
const lastName = formData.get('lastName') as string;
const admissionNumber = formData.get('admissionNumber') as string;

if (!firstName || !lastName || !admissionNumber) {
    return { error: 'Required fields missing' };
}

if (admissionNumber.length < 3) {
    return { error: 'Admission number too short' };
}
```

### After (Java - Jakarta Validation)

```java
public record CreateStudentRequest(
    @NotBlank(message = "First name is required")
    @Size(min = 2, max = 100)
    String firstName,

    @NotBlank(message = "Last name is required")
    @Size(min = 2, max = 100)
    String lastName,

    @NotBlank(message = "Admission number is required")
    @Size(min = 3, max = 50, message = "Admission number must be 3-50 characters")
    @Pattern(regexp = "^[A-Z0-9-]+$", message = "Invalid admission number format")
    String admissionNumber,

    @NotNull(message = "Date of birth is required")
    @Past(message = "Date of birth must be in the past")
    LocalDate dateOfBirth,

    @Size(max = 20)
    String gender,

    UUID classGroupId
) {}

// Controller automatically validates
@PostMapping
public ApiResponse<StudentResponse> createStudent(
    @Valid @RequestBody CreateStudentRequest request
) { ... }
```

---

## 4. Dependency Injection: Module → Spring DI

### Before (TypeScript - direct imports)

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Usage in actions
import { prisma } from '@/lib/db';

export async function getStudents() {
    const students = await prisma.student.findMany({
        where: { tenantId: session.tenantId }
    });
}
```

### After (Java - Spring DI)

```java
// Repository interface
@Repository
public interface StudentRepository extends JpaRepository<Student, UUID> {
    List<Student> findByTenantIdAndActiveTrue(UUID tenantId);
    Optional<Student> findByAdmissionNumber(String admissionNumber);
}

// Service with injected dependencies
@Service
@RequiredArgsConstructor
public class StudentService {
    private final StudentRepository studentRepository;
    private final TenantContext tenantContext;
    private final StudentMapper studentMapper;

    public List<StudentResponse> getStudents() {
        UUID tenantId = tenantContext.getCurrentTenantId();
        return studentRepository.findByTenantIdAndActiveTrue(tenantId)
            .stream()
            .map(studentMapper::toResponse)
            .toList();
    }
}
```

---

## 5. Middleware/Filters: Next.js Middleware → Spring Filters

### Before (TypeScript - middleware.ts)

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
    const session = await getSession();
    
    if (!session.isLoggedIn) {
        return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // Add tenant header
    const response = NextResponse.next();
    response.headers.set('X-Tenant-Id', session.tenantId);
    return response;
}
```

### After (Java - Spring Filter)

```java
@Component
@Order(1)
public class TenantFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws ServletException, IOException {
        
        String token = extractToken(request);
        if (token != null && jwtService.isValid(token)) {
            Claims claims = jwtService.getClaims(token);
            UUID tenantId = UUID.fromString(claims.get("tenantId", String.class));
            TenantContext.setCurrentTenantId(tenantId);
            
            // Set MDC for logging
            MDC.put("tenantId", tenantId.toString());
        }
        
        try {
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            MDC.clear();
        }
    }
}
```

---

## 6. Server Actions → REST Controllers

### Before (TypeScript - Server Action)

```typescript
// src/lib/actions/fees.ts
'use server';

export async function recordPayment(formData: FormData) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.tenantId) {
        return { error: 'Unauthorized' };
    }

    const invoiceId = formData.get('invoiceId') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const method = formData.get('method') as string;

    try {
        const payment = await prisma.payment.create({
            data: {
                tenantId: session.tenantId,
                invoiceId,
                amount,
                paymentMethod: method as any,
                status: 'COMPLETED',
                paidAt: new Date(),
            },
        });

        revalidatePath('/invoices');
        return { success: true, paymentId: payment.id };
    } catch (error) {
        return { error: 'Failed to record payment' };
    }
}
```

### After (Java - REST Controller + Service)

```java
// Controller
@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {
    
    private final PaymentService paymentService;

    @PostMapping
    @PreAuthorize("hasPermission('FEES_WRITE')")
    public ApiResponse<PaymentResponse> recordPayment(
        @Valid @RequestBody RecordPaymentRequest request
    ) {
        PaymentResponse payment = paymentService.recordPayment(request);
        return ApiResponse.ok(payment);
    }
}

// Service
@Service
@RequiredArgsConstructor
@Transactional
public class PaymentService {
    
    private final PaymentRepository paymentRepository;
    private final InvoiceRepository invoiceRepository;
    private final TenantContext tenantContext;
    private final AuditService auditService;

    @Audited(action = "CREATE", entity = "Payment")
    public PaymentResponse recordPayment(RecordPaymentRequest request) {
        UUID tenantId = tenantContext.getCurrentTenantId();
        
        Invoice invoice = invoiceRepository.findByIdAndTenantId(request.invoiceId(), tenantId)
            .orElseThrow(() -> new EntityNotFoundException("Invoice not found"));

        Payment payment = Payment.builder()
            .tenantId(tenantId)
            .invoice(invoice)
            .amount(request.amount())
            .paymentMethod(request.method())
            .status(PaymentStatus.COMPLETED)
            .paidAt(Instant.now())
            .build();

        payment = paymentRepository.save(payment);
        
        // Update invoice status
        updateInvoiceStatus(invoice);
        
        return paymentMapper.toResponse(payment);
    }
}
```

---

## 7. Async/Background → Spring Scheduler

### Before (TypeScript - would need external job runner)

```typescript
// Not implemented in current codebase - would use node-cron
// Example of what it would look like:
import cron from 'node-cron';

cron.schedule('0 9 * * *', async () => {
    // Send fee reminders daily at 9 AM
    await sendDailyFeeReminders();
});
```

### After (Java - Spring Scheduler)

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class FeeReminderScheduler {

    private final FeeReminderService feeReminderService;

    @Scheduled(cron = "0 0 9 * * *") // Every day at 9 AM
    @SchedulerLock(name = "fee-reminders", lockAtLeastFor = "5m")
    public void sendDailyFeeReminders() {
        log.info("Starting daily fee reminder job");
        
        feeReminderService.sendRemindersForDueInvoices();
        
        log.info("Completed daily fee reminder job");
    }
}
```

---

## 8. Exceptions → @ControllerAdvice

### Before (TypeScript - return error objects)

```typescript
export async function createStudent(formData: FormData) {
    try {
        // ...business logic
    } catch (error) {
        if (error.code === 'P2002') {
            return { error: 'Admission number already exists' };
        }
        console.error('Error creating student:', error);
        return { error: 'Failed to create student' };
    }
}
```

### After (Java - typed exceptions + advice)

```java
// Custom exceptions
public class EntityNotFoundException extends RuntimeException {
    public EntityNotFoundException(String entity, UUID id) {
        super(entity + " not found: " + id);
    }
}

public class DuplicateEntityException extends RuntimeException {
    public DuplicateEntityException(String message) {
        super(message);
    }
}

// Global handler
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<?> handleNotFound(EntityNotFoundException ex) {
        return ApiResponse.error(new ApiError("NOT_FOUND", ex.getMessage(), null));
    }

    @ExceptionHandler(DuplicateEntityException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiResponse<?> handleDuplicate(DuplicateEntityException ex) {
        return ApiResponse.error(new ApiError("DUPLICATE", ex.getMessage(), null));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiResponse<?> handleDataIntegrity(DataIntegrityViolationException ex) {
        if (ex.getMessage().contains("unique constraint")) {
            return ApiResponse.error(new ApiError("DUPLICATE", "Record already exists", null));
        }
        return ApiResponse.error(new ApiError("DATA_ERROR", "Data integrity error", null));
    }
}
```

---

## 9. Config/Env → Spring Profiles

### Before (TypeScript - process.env)

```typescript
// .env
DATABASE_URL="postgresql://..."
SESSION_SECRET="complex_password..."
GEMINI_API_KEY="..."

// Usage
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL required');
```

### After (Java - application.yml + profiles)

```yaml
# application.yml
spring:
  datasource:
    url: ${DATABASE_URL}
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD}

app:
  jwt:
    secret: ${JWT_SECRET}
    expiration: 15m
  ai:
    gemini:
      api-key: ${GEMINI_API_KEY}

---
# application-dev.yml
spring:
  config:
    activate:
      on-profile: dev
  datasource:
    url: jdbc:postgresql://localhost:5432/school_sis_dev
```

```java
@Configuration
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
    String secret,
    Duration expiration
) {}

// Usage
@Service
@RequiredArgsConstructor
public class JwtService {
    private final JwtProperties jwtProperties;
    
    public String generateToken(User user) {
        return Jwts.builder()
            .expiration(Date.from(Instant.now().plus(jwtProperties.expiration())))
            // ...
    }
}
```

---

## 10. Logging → SLF4J + MDC

### Before (TypeScript - console.log)

```typescript
console.log(`[Mock SMS] To: ${to}`);
console.log(`[Mock SMS] Message: ${body}`);
console.error('Error creating student:', error);
```

### After (Java - Structured Logging)

```java
@Slf4j
@Service
public class MessagingService {

    public void sendSms(String to, String message) {
        log.info("Sending SMS to recipient", 
            kv("recipientHash", hash(to)),
            kv("messageLength", message.length())
        );
        
        try {
            // Send SMS
            log.info("SMS sent successfully", kv("messageId", result.getId()));
        } catch (Exception e) {
            log.error("Failed to send SMS", kv("error", e.getMessage()), e);
        }
    }
}

// logback-spring.xml for JSON output
<encoder class="net.logstash.logback.encoder.LogstashEncoder">
    <includeMdcKeyName>tenantId</includeMdcKeyName>
    <includeMdcKeyName>userId</includeMdcKeyName>
    <includeMdcKeyName>requestId</includeMdcKeyName>
</encoder>
```

---

## Quick Reference Table

| TypeScript Pattern | Java Equivalent |
|-------------------|-----------------|
| `interface/type` | `record` (DTOs), `class` (entities) |
| `async/await` | `CompletableFuture` or reactive |
| `?.` optional chaining | `Optional<T>` |
| `??` nullish coalescing | `Objects.requireNonNullElse()` |
| `...spread` | `BeanUtils.copyProperties()` or MapStruct |
| `prisma.x.findMany()` | `repository.findAll()` |
| `FormData` | `@RequestBody` DTO |
| `revalidatePath()` | N/A (stateless API) |
| `redirect()` | Return redirect URL in response |
| `cookies()` | `@CookieValue` or HttpServletRequest |
