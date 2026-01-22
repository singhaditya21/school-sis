/**
 * Timetable Conflict Detection Service
 * Detects teacher double-booking, room conflicts, and period overlaps
 */

export interface TimetableEntry {
    id: string;
    day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
    period: number;
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    roomId: string;
    roomName: string;
    startTime: string;
    endTime: string;
}

export interface Conflict {
    id: string;
    type: 'TEACHER_DOUBLE_BOOKING' | 'ROOM_CONFLICT' | 'PERIOD_OVERLAP';
    severity: 'error' | 'warning';
    message: string;
    entries: TimetableEntry[];
    day: string;
    period: number;
}

export interface ConflictReport {
    totalEntries: number;
    conflictsFound: number;
    teacherConflicts: number;
    roomConflicts: number;
    conflicts: Conflict[];
    isValid: boolean;
}

/**
 * Detect all conflicts in a timetable
 */
export function detectConflicts(entries: TimetableEntry[]): ConflictReport {
    const conflicts: Conflict[] = [];

    // Group entries by day and period
    const entryMap: Record<string, TimetableEntry[]> = {};

    entries.forEach(entry => {
        const key = `${entry.day}-${entry.period}`;
        if (!entryMap[key]) entryMap[key] = [];
        entryMap[key].push(entry);
    });

    // Check for conflicts within each time slot
    Object.entries(entryMap).forEach(([key, slotEntries]) => {
        const [day, period] = key.split('-');

        // Check for teacher double-booking
        const teacherGroups: Record<string, TimetableEntry[]> = {};
        slotEntries.forEach(entry => {
            if (!teacherGroups[entry.teacherId]) teacherGroups[entry.teacherId] = [];
            teacherGroups[entry.teacherId].push(entry);
        });

        Object.entries(teacherGroups).forEach(([teacherId, teacherEntries]) => {
            if (teacherEntries.length > 1) {
                conflicts.push({
                    id: `teacher-${teacherId}-${day}-${period}`,
                    type: 'TEACHER_DOUBLE_BOOKING',
                    severity: 'error',
                    message: `${teacherEntries[0].teacherName} is assigned to ${teacherEntries.length} classes at the same time`,
                    entries: teacherEntries,
                    day,
                    period: parseInt(period),
                });
            }
        });

        // Check for room conflicts
        const roomGroups: Record<string, TimetableEntry[]> = {};
        slotEntries.forEach(entry => {
            if (!roomGroups[entry.roomId]) roomGroups[entry.roomId] = [];
            roomGroups[entry.roomId].push(entry);
        });

        Object.entries(roomGroups).forEach(([roomId, roomEntries]) => {
            if (roomEntries.length > 1) {
                conflicts.push({
                    id: `room-${roomId}-${day}-${period}`,
                    type: 'ROOM_CONFLICT',
                    severity: 'error',
                    message: `${roomEntries[0].roomName} is assigned to ${roomEntries.length} classes at the same time`,
                    entries: roomEntries,
                    day,
                    period: parseInt(period),
                });
            }
        });
    });

    const teacherConflicts = conflicts.filter(c => c.type === 'TEACHER_DOUBLE_BOOKING').length;
    const roomConflicts = conflicts.filter(c => c.type === 'ROOM_CONFLICT').length;

    return {
        totalEntries: entries.length,
        conflictsFound: conflicts.length,
        teacherConflicts,
        roomConflicts,
        conflicts,
        isValid: conflicts.length === 0,
    };
}

/**
 * Check if adding a new entry would cause conflicts
 */
export function checkNewEntryConflict(
    existingEntries: TimetableEntry[],
    newEntry: Partial<TimetableEntry>
): Conflict[] {
    const conflicts: Conflict[] = [];

    // Filter entries for the same day and period
    const sameSlot = existingEntries.filter(
        e => e.day === newEntry.day && e.period === newEntry.period
    );

    // Check teacher conflict
    const teacherConflict = sameSlot.find(e => e.teacherId === newEntry.teacherId);
    if (teacherConflict) {
        conflicts.push({
            id: `new-teacher-${newEntry.teacherId}`,
            type: 'TEACHER_DOUBLE_BOOKING',
            severity: 'error',
            message: `${newEntry.teacherName || 'Teacher'} is already teaching ${teacherConflict.className} at this time`,
            entries: [teacherConflict],
            day: newEntry.day || '',
            period: newEntry.period || 0,
        });
    }

    // Check room conflict
    const roomConflict = sameSlot.find(e => e.roomId === newEntry.roomId);
    if (roomConflict) {
        conflicts.push({
            id: `new-room-${newEntry.roomId}`,
            type: 'ROOM_CONFLICT',
            severity: 'error',
            message: `${newEntry.roomName || 'Room'} is already occupied by ${roomConflict.className} at this time`,
            entries: [roomConflict],
            day: newEntry.day || '',
            period: newEntry.period || 0,
        });
    }

    return conflicts;
}

/**
 * Generate mock timetable with some conflicts for demo
 */
export function generateMockTimetableWithConflicts(): { entries: TimetableEntry[]; report: ConflictReport } {
    const days: TimetableEntry['day'][] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const teachers = [
        { id: 't1', name: 'Dr. Anita Sharma' },
        { id: 't2', name: 'Mr. Rajesh Kumar' },
        { id: 't3', name: 'Mrs. Priya Patel' },
        { id: 't4', name: 'Mr. Suresh Menon' },
        { id: 't5', name: 'Ms. Kavita Nair' },
    ];
    const rooms = [
        { id: 'r1', name: 'Room 101' },
        { id: 'r2', name: 'Room 102' },
        { id: 'r3', name: 'Room 103' },
        { id: 'r4', name: 'Lab A' },
        { id: 'r5', name: 'Lab B' },
    ];
    const subjects = ['Mathematics', 'English', 'Science', 'Social Studies', 'Hindi'];
    const classes = ['10-A', '10-B', '10-C', '9-A', '9-B'];

    const entries: TimetableEntry[] = [];
    let id = 1;

    // Generate normal entries
    days.forEach(day => {
        for (let period = 1; period <= 8; period++) {
            const teacher = teachers[period % teachers.length];
            const room = rooms[period % rooms.length];
            const subject = subjects[period % subjects.length];
            const className = classes[period % classes.length];

            entries.push({
                id: `e${id++}`,
                day,
                period,
                classId: `c${period}`,
                className,
                subjectId: `sub${period}`,
                subjectName: subject,
                teacherId: teacher.id,
                teacherName: teacher.name,
                roomId: room.id,
                roomName: room.name,
                startTime: `${8 + period}:00`,
                endTime: `${8 + period}:45`,
            });
        }
    });

    // Add some conflicts (teacher double-booking)
    entries.push({
        id: `e${id++}`,
        day: 'Monday',
        period: 3,
        classId: 'c-extra1',
        className: '8-A',
        subjectId: 'sub-extra',
        subjectName: 'Mathematics',
        teacherId: 't3', // Mrs. Priya Patel
        teacherName: 'Mrs. Priya Patel',
        roomId: 'r5',
        roomName: 'Lab B',
        startTime: '11:00',
        endTime: '11:45',
    });

    // Add room conflict
    entries.push({
        id: `e${id++}`,
        day: 'Tuesday',
        period: 4,
        classId: 'c-extra2',
        className: '7-B',
        subjectId: 'sub-extra2',
        subjectName: 'Science',
        teacherId: 't5',
        teacherName: 'Ms. Kavita Nair',
        roomId: 'r4', // Lab A - already used
        roomName: 'Lab A',
        startTime: '12:00',
        endTime: '12:45',
    });

    const report = detectConflicts(entries);
    return { entries, report };
}
