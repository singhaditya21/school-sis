package com.schoolsis.timetable.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.timetable.application.TimetableService;
import com.schoolsis.timetable.application.TimetableService.CreateEntryCommand;
import com.schoolsis.timetable.domain.model.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/timetable")
public class TimetableController {

    private final TimetableService timetableService;

    public TimetableController(TimetableService timetableService) {
        this.timetableService = timetableService;
    }

    @GetMapping("/subjects")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<SubjectResponse>> getSubjects() {
        return ApiResponse.ok(timetableService.getSubjects().stream()
            .map(s -> new SubjectResponse(s.getId(), s.getName(), s.getCode(), s.getDescription())).toList());
    }

    @PostMapping("/subjects")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<SubjectResponse> createSubject(@Valid @RequestBody CreateSubjectRequest req) {
        Subject s = timetableService.createSubject(req.name(), req.code(), req.description());
        return ApiResponse.ok(new SubjectResponse(s.getId(), s.getName(), s.getCode(), s.getDescription()));
    }

    @GetMapping("/class/{classGroupId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT', 'STUDENT')")
    public ApiResponse<List<TimetableEntryResponse>> getClassTimetable(@PathVariable UUID classGroupId) {
        return ApiResponse.ok(timetableService.getClassTimetable(classGroupId).stream().map(this::toResponse).toList());
    }

    @GetMapping("/teacher/{teacherId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<List<TimetableEntryResponse>> getTeacherTimetable(@PathVariable UUID teacherId) {
        return ApiResponse.ok(timetableService.getTeacherTimetable(teacherId).stream().map(this::toResponse).toList());
    }

    @PostMapping("/entries")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<TimetableEntryResponse> createEntry(@Valid @RequestBody CreateEntryRequest req) {
        TimetableEntry e = timetableService.createEntry(new CreateEntryCommand(
            req.classGroupId(), req.dayOfWeek(), req.periodId(), req.subjectId(), req.teacherId(), req.room()));
        return ApiResponse.ok(toResponse(e));
    }

    private TimetableEntryResponse toResponse(TimetableEntry e) {
        return new TimetableEntryResponse(e.getId(), e.getClassGroupId(), e.getDayOfWeek(),
            e.getPeriodId(), e.getSubjectId(), e.getTeacherId(), e.getRoom());
    }

    public record CreateSubjectRequest(@NotBlank String name, String code, String description) {}
    public record CreateEntryRequest(@NotNull UUID classGroupId, @NotNull Integer dayOfWeek, @NotNull UUID periodId,
        @NotNull UUID subjectId, @NotNull UUID teacherId, String room) {}
    public record SubjectResponse(UUID id, String name, String code, String description) {}
    public record TimetableEntryResponse(UUID id, UUID classGroupId, Integer dayOfWeek, UUID periodId,
        UUID subjectId, UUID teacherId, String room) {}
}
