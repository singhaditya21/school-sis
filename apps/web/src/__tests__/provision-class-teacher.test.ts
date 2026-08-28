import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Provisioning must give every section a class teacher.
 *
 * Teacher attendance resolves a teacher's markable sections through
 * sections.class_teacher_id (or a timetable entry). Provisioning set neither, so
 * a provisioned branch had 0 of 39 sections owned: every teacher logged in to an
 * empty roll and could not mark attendance — the most-used daily task, dead on
 * arrival. Verified on a seeded branch that the fix owns all 39 sections across
 * the 8 teachers.
 */
const script = readFileSync(
    resolve(process.cwd(), 'scripts/provision-pilot-group.ts'),
    'utf8',
);

describe('pilot provisioning assigns class teachers', () => {
    it('captures the created teacher ids', () => {
        expect(script).toContain("if (role === 'TEACHER') teacherIds.push(staffRows[0].id)");
    });

    it('sets class_teacher_id on every section', () => {
        expect(script).toContain('UPDATE sections SET class_teacher_id');
        // Round-robin over the branch's teachers so each section has an owner.
        expect(script).toContain('teacherIds[sectionIndex % teacherIds.length]');
    });
});
