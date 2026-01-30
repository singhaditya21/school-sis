package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

/**
 * REST Controller for Teacher-specific endpoints.
 * Provides APIs for teacher dashboard, classes, schedule, attendance, and
 * gradebook.
 */
@RestController
@RequestMapping("/api/v1/teacher")
@PreAuthorize("hasAnyRole('TEACHER', 'SUPER_ADMIN')")
public class TeacherController {

    // ===== Response Records =====

    record ClassResponse(
            UUID id,
            String name,
            String grade,
            String section,
            String subject,
            int studentCount,
            String scheduleDay,
            String scheduleTime) {
    }

    record ScheduleSlotResponse(
            UUID id,
            int period,
            String startTime,
            String endTime,
            String subject,
            String className,
            String room,
            int dayOfWeek,
            boolean isNext) {
    }

    record StudentResponse(
            UUID id,
            String name,
            String rollNo,
            String admissionNo) {
    }

    record AttendanceRequest(
            UUID classId,
            LocalDate date,
            int period,
            List<AttendanceEntry> entries) {
    }

    record AttendanceEntry(
            UUID studentId,
            String status // PRESENT, ABSENT, LATE
    ) {
    }

    record MarksRequest(
            UUID classId,
            UUID examId,
            List<MarksEntry> entries) {
    }

    record MarksEntry(
            UUID studentId,
            Integer marks) {
    }

    // ===== API Endpoints =====

    /**
     * Get list of classes assigned to the teacher
     */
    @GetMapping("/classes")
    public ApiResponse<List<ClassResponse>> getMyClasses() {
        // TODO: Fetch from database based on authenticated teacher
        List<ClassResponse> classes = List.of(
                new ClassResponse(UUID.randomUUID(), "Class 10-A", "10", "A", "Mathematics", 42, "Mon, Wed, Fri",
                        "8:00 - 8:45"),
                new ClassResponse(UUID.randomUUID(), "Class 10-B", "10", "B", "Mathematics", 40, "Mon, Wed, Fri",
                        "8:45 - 9:30"),
                new ClassResponse(UUID.randomUUID(), "Class 9-A", "9", "A", "Mathematics", 45, "Tue, Thu",
                        "9:45 - 10:30"),
                new ClassResponse(UUID.randomUUID(), "Class 11-A", "11", "A", "Mathematics", 38, "Mon, Wed, Fri",
                        "11:15 - 12:00"),
                new ClassResponse(UUID.randomUUID(), "Class 11-B", "11", "B", "Mathematics", 36, "Tue, Thu",
                        "12:00 - 12:45"),
                new ClassResponse(UUID.randomUUID(), "Class 12-A", "12", "A", "Mathematics", 35, "Mon, Wed",
                        "2:00 - 2:45"));

        return ApiResponse.ok(classes);
    }

    /**
     * Get today's schedule for the teacher
     */
    @GetMapping("/schedule/today")
    public ApiResponse<List<ScheduleSlotResponse>> getTodaySchedule() {
        int todayDayOfWeek = LocalDate.now().getDayOfWeek().getValue();
        LocalTime now = LocalTime.now();

        // TODO: Fetch from database based on authenticated teacher
        List<ScheduleSlotResponse> allSlots = generateMockSchedule();

        // Filter for today and mark next class
        List<ScheduleSlotResponse> todaySlots = allSlots.stream()
                .filter(s -> s.dayOfWeek == todayDayOfWeek)
                .sorted(Comparator.comparingInt(ScheduleSlotResponse::period))
                .toList();

        // Mark the next upcoming class
        List<ScheduleSlotResponse> result = new ArrayList<>();
        boolean nextMarked = false;
        for (ScheduleSlotResponse slot : todaySlots) {
            LocalTime slotStart = LocalTime.parse(slot.startTime);
            boolean isNext = !nextMarked && slotStart.isAfter(now);
            if (isNext)
                nextMarked = true;
            result.add(new ScheduleSlotResponse(
                    slot.id, slot.period, slot.startTime, slot.endTime,
                    slot.subject, slot.className, slot.room, slot.dayOfWeek, isNext));
        }

        return ApiResponse.ok(result);
    }

    /**
     * Get full weekly schedule for the teacher
     */
    @GetMapping("/schedule")
    public ApiResponse<List<ScheduleSlotResponse>> getWeeklySchedule() {
        // TODO: Fetch from database
        List<ScheduleSlotResponse> slots = generateMockSchedule();
        return ApiResponse.ok(slots);
    }

    /**
     * Get students in a class
     */
    @GetMapping("/classes/{classId}/students")
    public ApiResponse<List<StudentResponse>> getClassStudents(
            @PathVariable UUID classId) {
        // TODO: Fetch from database
        List<StudentResponse> students = new ArrayList<>();
        String[] names = { "Aarav Sharma", "Aditi Patel", "Arjun Singh", "Diya Gupta", "Ishaan Kumar",
                "Kavya Reddy", "Lakshmi Nair", "Manav Joshi", "Nisha Verma", "Om Prakash" };

        for (int i = 0; i < names.length; i++) {
            students.add(new StudentResponse(
                    UUID.randomUUID(),
                    names[i],
                    String.format("%02d", i + 1),
                    "ADM-2024-" + String.format("%04d", 100 + i)));
        }

        return ApiResponse.ok(students);
    }

    /**
     * Submit attendance for a class/period
     */
    @PostMapping("/attendance")
    public ApiResponse<Map<String, Object>> submitAttendance(
            @RequestBody AttendanceRequest request) {
        // TODO: Save to database
        int presentCount = (int) request.entries.stream().filter(e -> "PRESENT".equals(e.status)).count();
        int absentCount = (int) request.entries.stream().filter(e -> "ABSENT".equals(e.status)).count();
        int lateCount = (int) request.entries.stream().filter(e -> "LATE".equals(e.status)).count();

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("date", request.date.toString());
        response.put("period", request.period);
        response.put("total", request.entries.size());
        response.put("present", presentCount);
        response.put("absent", absentCount);
        response.put("late", lateCount);

        return ApiResponse.ok(response);
    }

    /**
     * Submit marks for a class/exam
     */
    @PostMapping("/gradebook")
    public ApiResponse<Map<String, Object>> submitMarks(
            @RequestBody MarksRequest request) {
        // TODO: Save to database
        int enteredCount = (int) request.entries.stream().filter(e -> e.marks != null).count();
        double average = request.entries.stream()
                .filter(e -> e.marks != null)
                .mapToInt(MarksEntry::marks)
                .average()
                .orElse(0.0);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("classId", request.classId.toString());
        response.put("examId", request.examId.toString());
        response.put("entriesCount", enteredCount);
        response.put("classAverage", Math.round(average * 10.0) / 10.0);

        return ApiResponse.ok(response);
    }

    // ===== Helper Methods =====

    private List<ScheduleSlotResponse> generateMockSchedule() {
        List<ScheduleSlotResponse> slots = new ArrayList<>();

        // Monday
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 1, "08:00", "08:45", "Mathematics", "10-A", "Room 201", 1,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 2, "08:45", "09:30", "Mathematics", "10-B", "Room 201", 1,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 5, "11:15", "12:00", "Mathematics", "11-A", "Room 301", 1,
                false));

        // Tuesday
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 3, "09:45", "10:30", "Mathematics", "9-A", "Room 105", 2,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 6, "12:00", "12:45", "Mathematics", "11-B", "Room 301", 2,
                false));

        // Wednesday
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 1, "08:00", "08:45", "Mathematics", "10-A", "Room 201", 3,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 4, "10:30", "11:15", "Mathematics", "12-A", "Room 401", 3,
                false));

        // Thursday
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 2, "08:45", "09:30", "Mathematics", "9-A", "Room 105", 4,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 5, "11:15", "12:00", "Mathematics", "11-B", "Room 301", 4,
                false));

        // Friday
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 1, "08:00", "08:45", "Mathematics", "10-B", "Room 201", 5,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 3, "09:45", "10:30", "Mathematics", "11-A", "Room 301", 5,
                false));
        slots.add(new ScheduleSlotResponse(UUID.randomUUID(), 6, "12:00", "12:45", "Mathematics", "12-A", "Room 401", 5,
                false));

        return slots;
    }
}
