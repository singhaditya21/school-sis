package com.schoolsis.exams.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * CBSE Report Card Generator.
 * Generates comprehensive report cards following CBSE guidelines including:
 * - Scholastic areas (subjects with grades)
 * - Co-scholastic areas (art, health, work education)
 * - Health and Physical Education (HPC) data
 * - Discipline and attendance
 */
@Service
public class CbseReportCardService {

    private static final Logger log = LoggerFactory.getLogger(CbseReportCardService.class);

    /**
     * Generate CBSE-compliant report card.
     */
    public CbseReportCard generateReportCard(UUID tenantId, UUID studentId, UUID examId) {
        log.info("Generating CBSE report card for student {} exam {}", studentId, examId);

        // In production, fetch all data from repositories
        StudentInfo studentInfo = fetchStudentInfo(tenantId, studentId);
        List<ScholasticResult> scholasticResults = fetchScholasticResults(tenantId, studentId, examId);
        List<CoScholasticResult> coScholasticResults = fetchCoScholasticResults(tenantId, studentId, examId);
        HpcData hpcData = fetchHpcData(tenantId, studentId);
        AttendanceData attendanceData = fetchAttendanceData(tenantId, studentId, examId);

        // Calculate overall grade
        String overallGrade = calculateOverallGrade(scholasticResults);

        return new CbseReportCard(
                UUID.randomUUID(),
                studentInfo,
                examId,
                "Term 1 2025-26", // Exam name
                scholasticResults,
                coScholasticResults,
                hpcData,
                attendanceData,
                overallGrade,
                "", // Teacher remarks
                "", // Principal remarks
                LocalDate.now());
    }

    /**
     * Calculate overall grade from scholastic results.
     */
    private String calculateOverallGrade(List<ScholasticResult> results) {
        if (results.isEmpty())
            return "N/A";

        // Calculate average marks
        BigDecimal total = BigDecimal.ZERO;
        int count = 0;

        for (ScholasticResult result : results) {
            if (result.marksObtained() != null) {
                total = total.add(result.marksObtained());
                count++;
            }
        }

        if (count == 0)
            return "N/A";

        BigDecimal average = total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
        return mapToGrade(average.doubleValue());
    }

    /**
     * Map percentage to CBSE 9-point grading scale.
     */
    private String mapToGrade(double percentage) {
        if (percentage >= 91)
            return "A1";
        if (percentage >= 81)
            return "A2";
        if (percentage >= 71)
            return "B1";
        if (percentage >= 61)
            return "B2";
        if (percentage >= 51)
            return "C1";
        if (percentage >= 41)
            return "C2";
        if (percentage >= 33)
            return "D";
        return "E";
    }

    // Data fetching methods (mock implementations)

    private StudentInfo fetchStudentInfo(UUID tenantId, UUID studentId) {
        return new StudentInfo(
                studentId,
                "Student Name",
                "5A",
                "2015001",
                LocalDate.of(2010, 5, 15),
                "Mother's Name",
                "Father's Name");
    }

    private List<ScholasticResult> fetchScholasticResults(UUID tenantId, UUID studentId, UUID examId) {
        // In production, fetch from Mark repository with grading scheme
        return List.of(
                new ScholasticResult("English", BigDecimal.valueOf(85), BigDecimal.valueOf(100), "A2",
                        "Good performance"),
                new ScholasticResult("Hindi", BigDecimal.valueOf(78), BigDecimal.valueOf(100), "B1", "Satisfactory"),
                new ScholasticResult("Mathematics", BigDecimal.valueOf(92), BigDecimal.valueOf(100), "A1", "Excellent"),
                new ScholasticResult("Science", BigDecimal.valueOf(88), BigDecimal.valueOf(100), "A2", "Very good"),
                new ScholasticResult("Social Science", BigDecimal.valueOf(75), BigDecimal.valueOf(100), "B1",
                        "Good effort"));
    }

    private List<CoScholasticResult> fetchCoScholasticResults(UUID tenantId, UUID studentId, UUID examId) {
        return List.of(
                new CoScholasticResult("Visual Art", "A", "Shows good creativity"),
                new CoScholasticResult("Performing Art", "B", "Participates actively"),
                new CoScholasticResult("Work Education", "A", "Excellent craftsmanship"),
                new CoScholasticResult("General Knowledge", "A", "Curious and well-read"));
    }

    private HpcData fetchHpcData(UUID tenantId, UUID studentId) {
        // In production, fetch from HealthRecord repository
        return new HpcData(
                BigDecimal.valueOf(140), // Height cm
                BigDecimal.valueOf(35), // Weight kg
                BigDecimal.valueOf(17.9), // BMI
                "Normal", // BMI category
                "Normal", // Vision status
                "Good", // Hearing status
                "Healthy", // Dental status
                "Fit", // Physical fitness
                "A" // Overall HPC grade
        );
    }

    private AttendanceData fetchAttendanceData(UUID tenantId, UUID studentId, UUID examId) {
        return new AttendanceData(
                120, // Working days
                115, // Days present
                5, // Days absent
                95.8 // Attendance percentage
        );
    }

    // DTOs for CBSE Report Card

    public record CbseReportCard(
            UUID reportCardId,
            StudentInfo student,
            UUID examId,
            String examName,
            List<ScholasticResult> scholasticResults,
            List<CoScholasticResult> coScholasticResults,
            HpcData healthData,
            AttendanceData attendanceData,
            String overallGrade,
            String teacherRemarks,
            String principalRemarks,
            LocalDate generatedDate) {
    }

    public record StudentInfo(
            UUID studentId,
            String name,
            String className,
            String admissionNumber,
            LocalDate dateOfBirth,
            String motherName,
            String fatherName) {
    }

    public record ScholasticResult(
            String subject,
            BigDecimal marksObtained,
            BigDecimal maxMarks,
            String grade,
            String remarks) {
    }

    public record CoScholasticResult(
            String activity,
            String grade,
            String remarks) {
    }

    public record HpcData(
            BigDecimal heightCm,
            BigDecimal weightKg,
            BigDecimal bmi,
            String bmiCategory,
            String visionStatus,
            String hearingStatus,
            String dentalStatus,
            String physicalFitness,
            String overallGrade) {
    }

    public record AttendanceData(
            int workingDays,
            int daysPresent,
            int daysAbsent,
            double attendancePercentage) {
    }
}
