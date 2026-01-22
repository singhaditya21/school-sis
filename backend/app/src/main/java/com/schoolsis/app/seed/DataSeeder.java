package com.schoolsis.app.seed;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.*;

/**
 * Data Seeder for Sample Data
 * Generates 4,320 students (Classes 1-12, Sections A-F, 60 per section)
 * 
 * Run with: ./gradlew bootRun --args='--seed-data'
 * Or set profile: spring.profiles.active=seed
 */
@Configuration
@Profile("seed")
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private static final String TENANT_ID = "00000000-0000-0000-0000-000000000001";
    private static final String ACADEMIC_YEAR_ID = "a1000000-0000-0000-0000-000000000001";

    // Indian Names
    private static final String[] BOY_NAMES = {
            "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan",
            "Krishna", "Ishaan", "Shaurya", "Atharva", "Advik", "Pranav", "Advaith", "Aarush",
            "Dhruv", "Kabir", "Ritvik", "Arnav", "Yuvan", "Vedant", "Lakshya", "Rudra",
            "Parth", "Harsh", "Yash", "Rohan", "Karan", "Ansh", "Madhav", "Shivansh",
            "Darsh", "Anirudh", "Tanmay", "Rishi", "Sahil", "Prateek", "Siddharth", "Aryan"
    };

    private static final String[] GIRL_NAMES = {
            "Aadhya", "Ananya", "Aanya", "Saanvi", "Pari", "Anika", "Myra", "Sara",
            "Isha", "Diya", "Prisha", "Navya", "Aditi", "Kiara", "Riya", "Kavya",
            "Avni", "Aaradhya", "Shanaya", "Tara", "Nisha", "Pooja", "Sneha", "Shreya",
            "Divya", "Kriti", "Anjali", "Neha", "Ankita", "Priya", "Simran", "Tanvi"
    };

    private static final String[] LAST_NAMES = {
            "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Reddy", "Rao",
            "Nair", "Menon", "Agarwal", "Jain", "Chopra", "Malhotra", "Kapoor", "Mehta",
            "Shah", "Desai", "Joshi", "Kulkarni", "Banerjee", "Mukherjee", "Das", "Roy",
            "Saxena", "Srivastava", "Tiwari", "Pandey", "Shukla", "Mishra", "Tripathi", "Dubey"
    };

    private static final String[] FATHER_NAMES = {
            "Ramesh", "Suresh", "Mahesh", "Rajesh", "Vinod", "Anil", "Sunil", "Ravi",
            "Vijay", "Sanjay", "Ajay", "Pramod", "Arun", "Vikas", "Sandeep", "Deepak"
    };

    private static final String[] MOTHER_NAMES = {
            "Sunita", "Anita", "Kavita", "Rekha", "Meena", "Neha", "Geeta", "Seema",
            "Renu", "Poonam", "Jyoti", "Shanti", "Usha", "Nirmala", "Priya", "Archana"
    };

    private static final String[] SECTIONS = { "A", "B", "C", "D", "E", "F" };
    // Blood groups available for future health module integration
    @SuppressWarnings("unused")
    private static final String[] BLOOD_GROUPS = { "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-" };

    private final Random random = new Random();

    @Bean
    CommandLineRunner seedData(JdbcTemplate jdbc) {
        return args -> {
            log.info("🎓 Starting comprehensive data seeding...");
            log.info("📊 Target: 12 classes × 6 sections × 60 students = 4,320 students");

            // Check if data already exists
            Integer existingCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM students WHERE \"tenantId\" = ?::uuid",
                    Integer.class, TENANT_ID);

            if (existingCount != null && existingCount > 100) {
                log.info("⏭️ Data already exists ({} students). Skipping seed.", existingCount);
                return;
            }

            // Create academic year
            createAcademicYear(jdbc);

            int sequence = 1;
            int totalStudents = 0;

            for (int classNum = 1; classNum <= 12; classNum++) {
                for (String section : SECTIONS) {
                    String classId = createClassGroup(jdbc, classNum, section);

                    for (int i = 0; i < 60; i++) {
                        createStudent(jdbc, classId, classNum, section, sequence);
                        sequence++;
                        totalStudents++;
                    }
                }
                log.info("✅ Class {} complete ({} students)", classNum, 6 * 60);
            }

            log.info("🎉 Data seeding complete!");
            log.info("📊 Total students created: {}", totalStudents);
        };
    }

    private void createAcademicYear(JdbcTemplate jdbc) {
        jdbc.update(
                """
                        INSERT INTO academic_years (id, "tenantId", name, "startDate", "endDate", "isCurrent", "createdAt", "updatedAt")
                        VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, NOW(), NOW())
                        ON CONFLICT (id) DO NOTHING
                        """,
                ACADEMIC_YEAR_ID, TENANT_ID, "2025-26",
                LocalDate.of(2025, 4, 1), LocalDate.of(2026, 3, 31), true);
        log.info("📅 Academic year 2025-26 created");
    }

    private String createClassGroup(JdbcTemplate jdbc, int classNum, String section) {
        String classId = UUID.randomUUID().toString();
        String className = "Class " + classNum + "-" + section;

        jdbc.update("""
                INSERT INTO class_groups (id, "tenantId", name, "academicYearId", capacity, "createdAt", "updatedAt")
                VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?, NOW(), NOW())
                ON CONFLICT DO NOTHING
                """,
                classId, TENANT_ID, className, ACADEMIC_YEAR_ID, 60);

        return classId;
    }

    private void createStudent(JdbcTemplate jdbc, String classId, int classNum, String section, int sequence) {
        String studentId = UUID.randomUUID().toString();
        String guardianId = UUID.randomUUID().toString();
        String invoiceId = UUID.randomUUID().toString();

        boolean isBoy = random.nextBoolean();
        String firstName = isBoy ? random(BOY_NAMES) : random(GIRL_NAMES);
        String lastName = random(LAST_NAMES);
        String fatherName = random(FATHER_NAMES) + " " + lastName;
        String motherName = random(MOTHER_NAMES) + " " + lastName;

        int birthYear = 2026 - classNum - 5 - random.nextInt(2);
        LocalDate dob = LocalDate.of(birthYear, random.nextInt(12) + 1, random.nextInt(28) + 1);

        String admissionNumber = String.format("GWD%d%05d", 2025 - classNum / 2, sequence);
        String phone = "9" + String.format("%09d", random.nextLong(1000000000L));
        String email = firstName.toLowerCase() + "." + lastName.toLowerCase() + random.nextInt(100) + "@gmail.com";

        // Insert student
        jdbc.update("""
                INSERT INTO students (id, "tenantId", "admissionNumber", "firstName", "lastName",
                    "dateOfBirth", gender, "enrollmentDate", "isActive", "classGroupId", "createdAt", "updatedAt")
                VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?::uuid, NOW(), NOW())
                """,
                studentId, TENANT_ID, admissionNumber, firstName, lastName,
                dob, isBoy ? "MALE" : "FEMALE", LocalDate.of(2025, 4, 1), true, classId);

        // Insert guardian (father as primary)
        jdbc.update(
                """
                        INSERT INTO guardians (id, "tenantId", "firstName", "lastName", relationship, phone, email, "createdAt", "updatedAt")
                        VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, NOW(), NOW())
                        """,
                guardianId, TENANT_ID, fatherName.split(" ")[0], lastName, "FATHER", phone, email);

        // Log mother name for future secondary guardian support
        log.trace("Mother: {}", motherName);

        // Insert invoice
        int feeAmount = 15000 + (classNum * 2000);
        boolean isPaid = random.nextDouble() > 0.15;
        int paidAmount = isPaid ? feeAmount : (int) (feeAmount * random.nextDouble() * 0.5);
        String status = isPaid ? "PAID" : (paidAmount > 0 ? "PARTIAL" : "PENDING");

        jdbc.update("""
                INSERT INTO invoices (id, "tenantId", "studentId", "invoiceNumber", "dueDate",
                    "totalAmount", "paidAmount", status, "createdAt", "updatedAt")
                VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, NOW(), NOW())
                """,
                invoiceId, TENANT_ID, studentId, "INV-2025-" + String.format("%05d", sequence),
                LocalDate.of(2025, 4, 15), feeAmount, paidAmount, status);
    }

    private String random(String[] array) {
        return array[random.nextInt(array.length)];
    }
}
