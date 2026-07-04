import fs from 'fs';
import path from 'path';
import {
    findPageAccessPolicy,
    getPageAccessPolicy,
    isPublicPageRoute,
    isRoleAllowedForPage,
} from '@/lib/auth/page-access';

const APP_DIR = path.join(process.cwd(), 'src/app');

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        return fullPath;
    });
}

function routeFromPageFile(filePath: string): string {
    const relative = path.relative(APP_DIR, filePath).replaceAll(path.sep, '/');
    const routeFile = relative === 'page.tsx' ? '' : relative.replace(/\/page\.tsx$/, '');
    const segments = routeFile
        .split('/')
        .filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')))
        .map((segment) => {
            if (segment.startsWith('[') && segment.endsWith(']')) {
                return `sample-${segment.slice(1, -1).replaceAll('.', '-')}`;
            }
            return segment;
        });

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function canAccess(pathname: string, role: string): boolean {
    return isRoleAllowedForPage(role, getPageAccessPolicy(pathname));
}

describe('page access policy', () => {
    it('keeps only explicitly public pages public', () => {
        expect(isPublicPageRoute('/')).toBe(true);
        expect(isPublicPageRoute('/login')).toBe(true);
        expect(isPublicPageRoute('/admissions')).toBe(false);
        expect(isPublicPageRoute('/overview')).toBe(false);
        expect(isPublicPageRoute('/student')).toBe(false);
    });

    it('protects emitted admin and dashboard route-group paths for staff only', () => {
        for (const pathname of ['/admissions/new', '/fees', '/settings/users', '/executive', '/data', '/students']) {
            expect(canAccess(pathname, 'SCHOOL_ADMIN')).toBe(true);
            expect(canAccess(pathname, 'TEACHER')).toBe(true);
            expect(canAccess(pathname, 'PARENT')).toBe(false);
            expect(canAccess(pathname, 'STUDENT')).toBe(false);
        }
    });

    it('keeps parent, student, teacher, operator, and platform workspaces role-specific', () => {
        expect(canAccess('/overview', 'PARENT')).toBe(true);
        expect(canAccess('/overview', 'SCHOOL_ADMIN')).toBe(false);

        expect(canAccess('/student/ai-tutor', 'STUDENT')).toBe(true);
        expect(canAccess('/student/ai-tutor', 'TEACHER')).toBe(false);

        expect(canAccess('/teacher/gradebook', 'TEACHER')).toBe(true);
        expect(canAccess('/teacher/gradebook', 'STUDENT')).toBe(false);

        expect(canAccess('/operator', 'SCHOOL_ADMIN')).toBe(true);
        expect(canAccess('/operator', 'TEACHER')).toBe(false);

        expect(canAccess('/platform/tenants', 'PLATFORM_ADMIN')).toBe(true);
        expect(canAccess('/platform/tenants', 'SUPER_ADMIN')).toBe(false);
        expect(canAccess('/hq', 'PLATFORM_ADMIN')).toBe(true);
        expect(canAccess('/hq', 'SUPER_ADMIN')).toBe(false);
    });

    it('has explicit access policy coverage for every current page route', () => {
        const pageRoutes = walk(APP_DIR)
            .filter((file) => file.endsWith('/page.tsx'))
            .map(routeFromPageFile)
            .sort();

        const missing = pageRoutes.filter((route) => !findPageAccessPolicy(route));
        expect(missing).toEqual([]);
    });
});
