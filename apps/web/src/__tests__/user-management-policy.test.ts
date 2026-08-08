import { AUTHORIZATION_ROLE_VALUES } from '@school-sis/api';
import { ROLES } from '@/lib/constants';
import {
    canAssignUserRole,
    canManageUserRole,
    getAssignableUserRoles,
    normalizeUserRole,
} from '@/lib/users/role-policy';

describe('user-management role policy', () => {
    it('keeps UI roles aligned with the native authorization role enum', () => {
        expect([...Object.values(ROLES)].sort()).toEqual([...AUTHORIZATION_ROLE_VALUES].sort());
    });

    it('never permits tenant user management to assign PLATFORM_ADMIN', () => {
        for (const actorRole of ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']) {
            expect(canAssignUserRole(actorRole, 'PLATFORM_ADMIN')).toBe(false);
            expect(getAssignableUserRoles(actorRole)).not.toContain('PLATFORM_ADMIN');
        }
    });

    it('requires every manager to assign and manage strictly lower privilege roles', () => {
        expect(getAssignableUserRoles('PLATFORM_ADMIN')).toContain('SUPER_ADMIN');
        expect(getAssignableUserRoles('PLATFORM_ADMIN')).toContain('SCHOOL_ADMIN');

        expect(getAssignableUserRoles('SUPER_ADMIN')).not.toContain('SUPER_ADMIN');
        expect(getAssignableUserRoles('SUPER_ADMIN')).toContain('GROUP_EXECUTIVE');
        expect(getAssignableUserRoles('SUPER_ADMIN')).toContain('SCHOOL_ADMIN');

        expect(getAssignableUserRoles('SCHOOL_ADMIN')).not.toContain('SUPER_ADMIN');
        expect(getAssignableUserRoles('SCHOOL_ADMIN')).not.toContain('GROUP_EXECUTIVE');
        expect(getAssignableUserRoles('SCHOOL_ADMIN')).not.toContain('SCHOOL_ADMIN');
        expect(getAssignableUserRoles('SCHOOL_ADMIN')).toContain('PRINCIPAL');
        expect(getAssignableUserRoles('SCHOOL_ADMIN')).toContain('TEACHER');

        expect(canManageUserRole('SCHOOL_ADMIN', 'SCHOOL_ADMIN')).toBe(false);
        expect(canManageUserRole('SCHOOL_ADMIN', 'TEACHER')).toBe(true);
    });

    it('normalizes known roles and rejects arbitrary database role values', () => {
        expect(normalizeUserRole(' teacher ')).toBe('TEACHER');
        expect(normalizeUserRole('tenant_owner')).toBeNull();
        expect(canAssignUserRole('SCHOOL_ADMIN', 'tenant_owner')).toBe(false);
        expect(getAssignableUserRoles('TEACHER')).toEqual([]);
    });
});
