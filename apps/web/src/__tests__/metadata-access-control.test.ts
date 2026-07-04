import {
    canReadMetadataField,
    canWriteMetadataField,
    checkWritableMetadataPayload,
    filterReadableMetadataFields,
    type RuntimeMetadataFieldWithPermissions,
} from '@/lib/metadata/access-control';

function field(
    apiName: string,
    permissions: RuntimeMetadataFieldWithPermissions['permissions'] = [],
    isRequired = false,
): RuntimeMetadataFieldWithPermissions {
    return {
        id: `${apiName}-id`,
        apiName,
        label: apiName,
        dataType: 'TEXT',
        isRequired,
        permissions,
    };
}

describe('metadata access control', () => {
    it('defaults tenant admins to read/write while requiring explicit grants for other roles', () => {
        const publicField = field('public_note');

        expect(canReadMetadataField('SCHOOL_ADMIN', publicField)).toBe(true);
        expect(canWriteMetadataField('SCHOOL_ADMIN', publicField)).toBe(true);
        expect(canReadMetadataField('TEACHER', publicField)).toBe(false);
        expect(canWriteMetadataField('TEACHER', publicField)).toBe(false);
    });

    it('uses field_permissions rows for non-admin read/write access', () => {
        const counselorField = field('counselor_note', [
            { role: 'ADMISSION_COUNSELOR', canRead: true, canWrite: true },
            { role: 'TEACHER', canRead: true, canWrite: false },
        ]);

        expect(canReadMetadataField('ADMISSION_COUNSELOR', counselorField)).toBe(true);
        expect(canWriteMetadataField('ADMISSION_COUNSELOR', counselorField)).toBe(true);
        expect(canReadMetadataField('TEACHER', counselorField)).toBe(true);
        expect(canWriteMetadataField('TEACHER', counselorField)).toBe(false);
    });

    it('filters unreadable fields and denies forbidden write payload fields', () => {
        const fields = [
            field('public_note', [{ role: 'TEACHER', canRead: true, canWrite: false }]),
            field('private_note'),
            field('required_admin_note', [], true),
        ];

        expect(filterReadableMetadataFields(fields, 'TEACHER').map((item) => item.apiName)).toEqual(['public_note']);

        expect(checkWritableMetadataPayload(fields, 'TEACHER', {
            public_note: 'visible',
            private_note: 'hidden',
        })).toEqual({
            ok: false,
            deniedFields: ['public_note', 'private_note'],
            blockedRequiredFields: ['required_admin_note'],
        });
    });

    it('does not allow field permissions to lock out platform and super admins', () => {
        const lockedField = field('locked', [
            { role: 'PLATFORM_ADMIN', canRead: false, canWrite: false },
            { role: 'SUPER_ADMIN', canRead: false, canWrite: false },
        ]);

        expect(canReadMetadataField('PLATFORM_ADMIN', lockedField)).toBe(true);
        expect(canWriteMetadataField('PLATFORM_ADMIN', lockedField)).toBe(true);
        expect(canReadMetadataField('SUPER_ADMIN', lockedField)).toBe(true);
        expect(canWriteMetadataField('SUPER_ADMIN', lockedField)).toBe(true);
    });
});
