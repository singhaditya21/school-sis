package com.schoolsis.app.seed;

import com.schoolsis.common.api.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

/**
 * Data Seeder REST Controller
 * Call POST /api/v1/admin/seed to generate 4,320 sample students
 */
@RestController
@RequestMapping("/api/v1/admin")
public class DataSeederController {

    private static final Logger log = LoggerFactory.getLogger(DataSeederController.class);

    private static final String TENANT_ID = "00000000-0000-0000-0000-000000000001";
    private static final String ACADEMIC_YEAR_ID = "a1000000-0000-0000-0000-000000000001";

    private static final String[] BOY_NAMES = {
            "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
            "Krishna", "Ishaan", "Shaurya", "Atharva", "Advik", "Pranav", "Advaith", "Aarush",
            "Dhruv", "Kabir", "Ritvik", "Arnav", "Yuvan", "Vedant", "Lakshya", "Rudra"
    };

    private static final String[] GIRL_NAMES = {
            "Aadhya", "Ananya", "Aanya", "Saanvi", "Pari", "Anika", "Myra", "Sara",
            "Isha", "Diya", "Prisha", "Navya", "Aditi", "Kiara", "Riya", "Kavya"
    };

    private static final String[] LAST_NAMES = {
            "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Rao",
            "Nair", "Menon", "Agarwal", "Jain", "Chopra", "Malhotra", "Kapoor", "Mehta"
    };

    private static final String[] SECTIONS = { "A", "B", "C", "D", "E", "F" };

    private final JdbcTemplate jdbc;
    private final Random random = new Random();

    public DataSeederController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/seed")
    public ApiResponse<SeedResult> seedData() {
        log.info("🎓 Starting data seeding...");

        try {
            // Check existing count
            Integer existing = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM students WHERE \"tenantId\" = ?::uuid",
                    Integer.class, TENANT_ID);

            if (existing != null && existing > 100) {
                return ApiResponse.ok(new SeedResult(0, "Data already exists: " + existing + " students"));
            }

            // Create academic year
            jdbc.update(
                    """
                            INSERT INTO academic_years (id, "tenantId", name, "startDate", "endDate", "isCurrent", "createdAt", "updatedAt")
                            VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, NOW(), NOW())
                            ON CONFLICT (id) DO NOTHING
                            """,
                    ACADEMIC_YEAR_ID, TENANT_ID, "2025-26",
                    LocalDate.of(2025, 4, 1), LocalDate.of(2026, 3, 31), true);

            int seq = 1;
            for (int classNum = 1; classNum <= 12; classNum++) {
                for (String section : SECTIONS) {
                    String classId = UUID.randomUUID().toString();

                    // Create class
                    jdbc.update(
                            """
                                    INSERT INTO class_groups (id, "tenantId", name, "academicYearId", capacity, "createdAt", "updatedAt")
                                    VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?, NOW(), NOW())
                                    ON CONFLICT DO NOTHING
                                    """,
                            classId, TENANT_ID, "Class " + classNum + "-" + section, ACADEMIC_YEAR_ID, 60);

                    // Create 60 students
                    for (int i = 0; i < 60; i++) {
                        createStudent(classId, classNum, seq++);
                    }
                }
                log.info("✅ Class {} complete", classNum);
            }

            log.info("🎉 Seeding complete: {} students", seq - 1);
            return ApiResponse.ok(new SeedResult(seq - 1, "Success"));

        } catch (Exception e) {
            log.error("Seed failed", e);
            return ApiResponse.ok(new SeedResult(0, "Error: " + e.getMessage()));
        }
    }

    private void createStudent(String classId, int classNum, int seq) {
        String studentId = UUID.randomUUID().toString();
        boolean isBoy = random.nextBoolean();
        String firstName = isBoy ? BOY_NAMES[random.nextInt(BOY_NAMES.length)]
                : GIRL_NAMES[random.nextInt(GIRL_NAMES.length)];
        String lastName = LAST_NAMES[random.nextInt(LAST_NAMES.length)];
        int birthYear = 2026 - classNum - 5 - random.nextInt(2);
        LocalDate dob = LocalDate.of(birthYear, random.nextInt(12) + 1, random.nextInt(28) + 1);

        jdbc.update("""
                INSERT INTO students (id, "tenantId", "admissionNumber", "firstName", "lastName",
                    "dateOfBirth", gender, "enrollmentDate", "isActive", "classGroupId", "createdAt", "updatedAt")
                VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?::uuid, NOW(), NOW())
                """,
                studentId, TENANT_ID, String.format("GWD%d%05d", 2025 - classNum / 2, seq),
                firstName, lastName, dob, isBoy ? "MALE" : "FEMALE",
                LocalDate.of(2025, 4, 1), true, classId);

        // Create invoice
        int fee = 15000 + (classNum * 2000);
        boolean paid = random.nextDouble() > 0.15;

        jdbc.update("""
                INSERT INTO invoices (id, "tenantId", "studentId", "invoiceNumber", "dueDate",
                    "totalAmount", "paidAmount", status, "createdAt", "updatedAt")
                VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, NOW(), NOW())
                """,
                UUID.randomUUID().toString(), TENANT_ID, studentId,
                "INV-2025-" + String.format("%05d", seq),
                LocalDate.of(2025, 4, 15), fee,
                paid ? fee : 0, paid ? "PAID" : "PENDING");
    }

    @GetMapping("/seed/status")
    public ApiResponse<Map<String, Object>> seedStatus() {
        Integer students = jdbc.queryForObject("SELECT COUNT(*) FROM students", Integer.class);
        Integer classes = jdbc.queryForObject("SELECT COUNT(*) FROM class_groups", Integer.class);
        Integer invoices = jdbc.queryForObject("SELECT COUNT(*) FROM invoices", Integer.class);

        return ApiResponse.ok(Map.of(
                "students", students != null ? students : 0,
                "classes", classes != null ? classes : 0,
                "invoices", invoices != null ? invoices : 0));
    }

    public record SeedResult(int studentsCreated, String message) {
    }
}
