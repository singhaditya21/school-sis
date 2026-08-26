/** Mirrors the Postgres `id_card_status` enum. */
export const ID_CARD_STATUSES = ['PENDING', 'PRINTED', 'ISSUED'] as const;

export type IdCardStatus = (typeof ID_CARD_STATUSES)[number];

export const ID_CARD_STATUS_LABELS: Record<string, string> = {
    PENDING: 'Not printed',
    PRINTED: 'Printed',
    ISSUED: 'Handed over',
};

export function idCardStatusClass(status: string): string {
    switch (status) {
        case 'ISSUED':
            return 'bg-green-100 text-green-800';
        case 'PRINTED':
            return 'bg-blue-100 text-blue-800';
        case 'PENDING':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

export type PersonType = 'STUDENT' | 'STAFF';

export function isPersonType(value: string | undefined | null): value is PersonType {
    return value === 'STUDENT' || value === 'STAFF';
}
