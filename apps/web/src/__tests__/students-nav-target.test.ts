import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The primary "Students" nav must point at the working student list.
 *
 * It pointed at /app/student — the generic metadata-engine object view, which
 * calls getObjectMetadata('student') and throws "Object not found" because
 * metadata_objects is seeded by no deploy or provisioning path. The page caught
 * the throw and rendered an "Error Loading Object" box at HTTP 200, so the route
 * sweep (which checks status, not content) passed it while every real tenant saw
 * a red error on the most-used nav item. /students is the built-in list the
 * smoke suite already asserts renders real students.
 */
const layout = readFileSync(
    resolve(process.cwd(), 'src/app/(admin)/layout.tsx'),
    'utf8',
);

describe('primary Students navigation', () => {
    it('points at the working /students list, not the metadata-engine object view', () => {
        const studentsLink = /<NavLink href="([^"]+)"[^>]*>\s*Students/.exec(layout);
        expect(studentsLink).not.toBeNull();
        expect(studentsLink![1]).toBe('/students');
    });

    it('does not route a primary nav item through /app/<object>, which needs seeded metadata', () => {
        expect(layout).not.toContain('href="/app/student"');
    });
});
