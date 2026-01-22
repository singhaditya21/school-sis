rootProject.name = "school-sis"

// Domain modules
include("common")
include("platform:platform-api")
include("platform:platform-impl")
include("students:students-api")
include("students:students-impl")
include("fees:fees-api")
include("fees:fees-impl")
include("attendance:attendance-api")
include("attendance:attendance-impl")
include("exams:exams-api")
include("exams:exams-impl")
include("admissions:admissions-api")
include("admissions:admissions-impl")
include("timetable:timetable-api")
include("timetable:timetable-impl")
include("transport:transport-api")
include("transport:transport-impl")
include("communication:communication-api")
include("communication:communication-impl")

// Main application
include("app")
