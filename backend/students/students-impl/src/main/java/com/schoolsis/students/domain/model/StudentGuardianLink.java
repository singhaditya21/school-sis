package com.schoolsis.students.domain.model;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * Link between Student and Guardian.
 * Maps to the 'student_guardian_links' table.
 */
@Entity
@Table(name = "student_guardian_links", indexes = {
    @Index(columnList = "student_id"),
    @Index(columnList = "guardian_id")
})
public class StudentGuardianLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "guardian_id", nullable = false)
    private UUID guardianId;

    @Column(nullable = false)
    private String relationship; // "Father", "Mother", "Guardian"

    @Column(name = "is_emergency_contact")
    private boolean emergencyContact = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", insertable = false, updatable = false)
    private Student student;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guardian_id", insertable = false, updatable = false)
    private Guardian guardian;

    // Constructors
    public StudentGuardianLink() {}

    public StudentGuardianLink(UUID studentId, UUID guardianId, String relationship) {
        this.studentId = studentId;
        this.guardianId = guardianId;
        this.relationship = relationship;
    }

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }

    public UUID getGuardianId() { return guardianId; }
    public void setGuardianId(UUID guardianId) { this.guardianId = guardianId; }

    public String getRelationship() { return relationship; }
    public void setRelationship(String relationship) { this.relationship = relationship; }

    public boolean isEmergencyContact() { return emergencyContact; }
    public void setEmergencyContact(boolean emergencyContact) { this.emergencyContact = emergencyContact; }

    public Student getStudent() { return student; }
    public Guardian getGuardian() { return guardian; }
}
