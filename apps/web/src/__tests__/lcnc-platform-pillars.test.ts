import {
    canAccessObjectCrud,
    evaluateEffectivePermission,
    matchCustomPermissionGrant,
    type EffectiveUserRoleContext,
} from '@/lib/rbac/custom-roles';
import {
    canReadMetadataField,
    canWriteMetadataField,
    checkWritableMetadataPayload,
    type RuntimeMetadataFieldWithPermissions,
} from '@/lib/metadata/access-control';
import {
    applyViewFilterRules,
    computeHomeKpiCards,
    listPermittedLayoutsForRole,
    resolveLayoutForRole,
    sortRecordsByField,
} from '@/lib/metadata/lcnc-helpers';
import type { MetadataField, MetadataLayout } from '@/lib/actions/metadata-engine';

describe('LCNC 6-Pillar Platform Runtime', () => {
    describe('Pillar 2: Custom Tenant Roles & Privilege Escalation Guard', () => {
        it('matches exact, module wildcard, and 3-part object CRUD grants while blocking platform:*', () => {
            const grants = [
                'hostel:*',
                'reports:read',
                'object:hostel:read',
                'object:hostel:update',
                'object:discipline_incident:*',
                'platform:impersonate',
            ];

            expect(matchCustomPermissionGrant(grants, 'hostel:allocate')).toBe(true);
            expect(matchCustomPermissionGrant(grants, 'reports:read')).toBe(true);
            expect(matchCustomPermissionGrant(grants, 'reports:export')).toBe(false);
            expect(matchCustomPermissionGrant(grants, 'object:hostel:read')).toBe(true);
            expect(matchCustomPermissionGrant(grants, 'object:hostel:delete')).toBe(false);
            expect(matchCustomPermissionGrant(grants, 'object:discipline_incident:delete')).toBe(true);
            expect(matchCustomPermissionGrant(grants, 'platform:impersonate')).toBe(false);
            expect(matchCustomPermissionGrant(['*'], 'platform:tenants')).toBe(false);
        });

        it('evaluates EffectiveUserRoleContext for custom roles and falls back to baseRole when unassigned', () => {
            const wardenCtx: EffectiveUserRoleContext = {
                baseRole: 'TEACHER',
                effectiveRoleCode: 'HOSTEL_WARDEN',
                customRoleId: '11111111-1111-4111-8111-111111111111',
                customRoleName: 'Hostel Warden',
                customPermissions: ['hostel:*', 'object:hostel:read', 'object:hostel:create'],
            };

            expect(evaluateEffectivePermission(wardenCtx, 'hostel:read')).toBe(true);
            expect(evaluateEffectivePermission(wardenCtx, 'fees:write')).toBe(false);
            expect(canAccessObjectCrud(wardenCtx, 'hostel', 'create')).toBe(true);
            expect(canAccessObjectCrud(wardenCtx, 'hostel', 'delete')).toBe(false);

            const schoolAdminDefault: EffectiveUserRoleContext = {
                baseRole: 'SCHOOL_ADMIN',
                effectiveRoleCode: 'SCHOOL_ADMIN',
                customRoleId: null,
                customRoleName: null,
                customPermissions: null,
            };
            expect(evaluateEffectivePermission(schoolAdminDefault, 'metadata:publish')).toBe(true);
            expect(evaluateEffectivePermission(schoolAdminDefault, 'platform:billing')).toBe(false);
        });

        it('evaluates Field-Level Security (FLS) for custom roles with baseRole fallback', () => {
            const field: RuntimeMetadataFieldWithPermissions = {
                apiName: 'warden_notes',
                label: 'Warden Notes',
                dataType: 'TEXT',
                isRequired: true,
                permissions: [
                    { role: 'HOSTEL_WARDEN', canRead: true, canWrite: true },
                    { role: 'TEACHER', canRead: true, canWrite: false },
                ],
            };

            expect(canReadMetadataField('HOSTEL_WARDEN', field, 'TEACHER')).toBe(true);
            expect(canWriteMetadataField('HOSTEL_WARDEN', field, 'TEACHER')).toBe(true);
            expect(canWriteMetadataField('SPORTS_COORDINATOR', field, 'TEACHER')).toBe(false);

            const writeCheckOk = checkWritableMetadataPayload(
                [field],
                'HOSTEL_WARDEN',
                { warden_notes: 'Checked in at 8 PM' },
                'TEACHER',
            );
            expect(writeCheckOk.ok).toBe(true);

            const writeCheckDenied = checkWritableMetadataPayload(
                [field],
                'SPORTS_COORDINATOR',
                { warden_notes: 'Unauthorized edit' },
                'TEACHER',
            );
            expect(writeCheckDenied.ok).toBe(false);
        });
    });

    describe('Pillar 3: Named Multi-Forms & Role-Scoped Layout Resolution', () => {
        const layouts: MetadataLayout[] = [
            {
                id: 'form-default',
                objectId: 'obj-1',
                name: 'Default Admission Form',
                layoutType: 'FORM',
                assignedRoles: [],
                schema: { sections: [{ title: 'Standard', fields: ['applicant_name'] }] },
                isDefault: true,
            },
            {
                id: 'form-counselor',
                objectId: 'obj-1',
                name: 'Counselor Intake Form',
                layoutType: 'FORM',
                assignedRoles: ['ADMISSION_COUNSELOR', 'SENIOR_COUNSELOR'],
                schema: { sections: [{ title: 'Counselor', fields: ['applicant_name', 'status'] }] },
                isDefault: false,
            },
            {
                id: 'form-principal',
                objectId: 'obj-1',
                name: 'Principal Final Review Form',
                layoutType: 'FORM',
                assignedRoles: ['PRINCIPAL'],
                schema: { sections: [{ title: 'Principal', fields: ['status'] }] },
                isDefault: false,
            },
        ];

        it('resolves exact role-assigned form before default form and blocks unauthorized layoutId overrides', () => {
            const counselorResolved = resolveLayoutForRole(
                layouts,
                'FORM',
                'SENIOR_COUNSELOR',
                'TEACHER',
            );
            expect(counselorResolved?.id).toBe('form-counselor');

            // Counselor attempting to force Principal form falls back to Counselor form
            const blockedOverride = resolveLayoutForRole(
                layouts,
                'FORM',
                'SENIOR_COUNSELOR',
                'TEACHER',
                'form-principal',
            );
            expect(blockedOverride?.id).toBe('form-counselor');

            // School Admin can preview any named form via layoutId
            const adminPreview = resolveLayoutForRole(
                layouts,
                'FORM',
                'SCHOOL_ADMIN',
                'SCHOOL_ADMIN',
                'form-principal',
            );
            expect(adminPreview?.id).toBe('form-principal');

            const teacherPermitted = listPermittedLayoutsForRole(
                layouts,
                'FORM',
                'TEACHER',
                'TEACHER',
            );
            expect(teacherPermitted.map(l => l.id)).toEqual(['form-default']);
        });
    });

    describe('Pillars 4 & 6: Persistent View Filtering, Sorting & Object Home KPIs', () => {
        const sampleFields: MetadataField[] = [
            {
                id: 'f1',
                objectId: 'o1',
                label: 'Wing',
                apiName: 'wing',
                dataType: 'PICKLIST',
                isCustom: false,
                isRequired: true,
                defaultValue: null,
                picklistOptions: ['North', 'South'],
                validationRules: {},
                status: 'ACTIVE',
                version: 1,
            },
            {
                id: 'f2',
                objectId: 'o1',
                label: 'Fee Due',
                apiName: 'fee_due',
                dataType: 'CURRENCY',
                isCustom: true,
                isRequired: false,
                defaultValue: null,
                picklistOptions: [],
                validationRules: {},
                status: 'ACTIVE',
                version: 1,
            },
        ];

        const sampleRecords = [
            { id: 'r1', wing: 'North', fee_due: 15000, status: 'ACTIVE' },
            { id: 'r2', wing: 'South', fee_due: 5000, status: 'ACTIVE' },
            { id: 'r3', wing: 'North', fee_due: 25000, status: 'PENDING' },
        ];

        it('applies multi-condition view filters and numeric sorting accurately', () => {
            const filtered = applyViewFilterRules(sampleRecords, [
                { field: 'wing', operator: 'equals', value: 'north' },
                { field: 'fee_due', operator: 'gt', value: '18000' },
            ]);
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('r3');

            const sortedAsc = sortRecordsByField(sampleRecords, 'fee_due', 'ASC');
            expect(sortedAsc.map(r => r.id)).toEqual(['r2', 'r1', 'r3']);
        });

        it('computes configured Object Home KPI cards across COUNT, SUM, and filtered slices', () => {
            const kpis = computeHomeKpiCards(sampleRecords, sampleFields, {
                welcomeHeadline: 'Hostel Operations Home',
                kpiCards: [
                    { id: 'k1', label: 'Active Residents', aggregate: 'COUNT', filterField: 'status', filterValue: 'ACTIVE' },
                    { id: 'k2', label: 'Total Hostel Dues', aggregate: 'SUM', fieldApiName: 'fee_due' },
                ],
            });

            expect(kpis).toHaveLength(2);
            expect(kpis[0].value).toBe('2');
            expect(kpis[1].value).toContain('45,000');
        });
    });
});
