/** @jest-environment node */

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn();
const mockPoolQuery = jest.fn();
const mockSqlHandler = jest.fn();
const mockRequireAuth = jest.fn();
const mockRedirect = jest.fn((target: string) => {
    const err = new Error('NEXT_REDIRECT') as Error & { digest?: string; target?: string };
    err.digest = `NEXT_REDIRECT;replace;${target};307;`;
    err.target = target;
    throw err;
});

function createSqlTagResult<T>(promise: Promise<T>) {
    const extended = promise as Promise<T> & { execute: () => Promise<T> };
    extended.execute = () => promise;
    return extended;
}

const mockSql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const queryText = strings.join(' ? ');
    return createSqlTagResult(Promise.resolve(mockSqlHandler(queryText, values)));
};

jest.mock('@/lib/db', () => ({
    pool: {
        connect: (...args: unknown[]) => mockPoolConnect(...args),
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => mockSql(strings, ...values),
    sqlFor: () => (strings: TemplateStringsArray, ...values: unknown[]) =>
        mockSql(strings, ...values),
    identifier: (name: string) => `"${name}"`,
    RLS_BYPASS_JUSTIFICATIONS: {
        PROVIDER_PAYMENT_LOOKUP: 'PROVIDER_PAYMENT_LOOKUP',
        PROVIDER_EVENT_LEDGER: 'PROVIDER_EVENT_LEDGER',
        RAZORPAY_SUBSCRIPTION_UPDATE: 'RAZORPAY_SUBSCRIPTION_UPDATE',
        PUBLIC_PORTAL_TENANT_LOOKUP: 'PUBLIC_PORTAL_TENANT_LOOKUP',
    },
    runWithRlsBypass: (_justification: string, fn: () => unknown) => fn(),
    runWithTenantContext: (_tenantId: string, fn: () => unknown) => fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    requireRole: (...args: unknown[]) => mockRequireAuth(...args),
}));

jest.mock('next/navigation', () => ({
    redirect: (target: string) => mockRedirect(target),
}));

jest.mock('next/cache', () => ({
    unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    revalidateTag: jest.fn(),
}));

jest.mock('next/headers', () => ({
    headers: jest.fn(async () => new Headers()),
}));

import { completeProviderPayment, recordManualPayment } from '@/lib/payments/ledger';
import {
    bulkImportRecords,
    decideRecordApproval,
    deleteRecord,
    queryRecords,
    updateRecordFieldValue,
    upsertRecord,
} from '@/lib/actions/metadata-engine';
import {
    LEDGER_AND_IDENTITY_PROTECTED_TABLES,
    PROTECTED_LEGACY_PLAINTEXT_COLUMNS,
} from '@/lib/metadata/access-control';
import { renderMetadataDocumentTemplate } from '@/lib/metadata/platform';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import { normalizeLegacyRow } from '@/lib/import/legacy-erp-parser';
import {
    createPresignedObjectUrl,
    resolveObjectStorageConfig,
} from '@/lib/storage/s3-config';
import { canAccessStudentDocument } from '@/lib/auth/document-access';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const RECORD_ID = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
    jest.clearAllMocks();
    mockPoolConnect.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
    });
});

describe('CRIT-01 & MED-10: Financial Ledger Concurrency, Order Registration & Savepoint Idempotency', () => {
    it('acquires FOR UPDATE locks on payment_orders and invoices BEFORE checking duplicate payments', async () => {
        const executedQueries: string[] = [];

        mockClientQuery.mockImplementation(async (sqlText: string) => {
            const normalized = sqlText.replace(/\s+/g, ' ').trim();
            executedQueries.push(normalized);

            if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
                return { rows: [] };
            }
            if (normalized.includes('FROM payment_orders') && normalized.includes('FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: 'ord-row-1',
                            tenantId: TENANT_ID,
                            invoiceId: INVOICE_ID,
                            studentId: STUDENT_ID,
                            provider: 'RAZORPAY',
                            providerOrderId: 'order_live_123',
                            providerPaymentId: null,
                            amount: '150.00',
                            amountMinor: 15000,
                            currency: 'INR',
                            status: 'CREATED',
                            idempotencyKey: `RAZORPAY:${INVOICE_ID}:15000:INR`,
                        },
                    ],
                };
            }
            if (normalized.includes('FROM invoices') && normalized.includes('FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: INVOICE_ID,
                            tenantId: TENANT_ID,
                            studentId: STUDENT_ID,
                            invoiceNumber: 'INV-2026-001',
                            totalAmount: '150.00',
                            paidAmount: '0.00',
                            status: 'PENDING',
                        },
                    ],
                };
            }
            if (normalized.includes('SELECT id FROM payments')) {
                return { rows: [{ id: 'pay-existing-1' }] };
            }
            if (normalized.includes('INSERT INTO payment_audit_logs')) {
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${normalized}`);
        });

        const result = await completeProviderPayment({
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            provider: 'RAZORPAY',
            providerOrderId: 'order_live_123',
            providerPaymentId: 'pay_live_123',
            amountMinor: 15000,
            currency: 'INR',
        });

        expect(result).toEqual({
            paymentId: 'pay-existing-1',
            alreadyProcessed: true,
            duplicate: true,
        });

        const orderLockIdx = executedQueries.findIndex(
            q => q.includes('FROM payment_orders') && q.includes('FOR UPDATE'),
        );
        const invoiceLockIdx = executedQueries.findIndex(
            q => q.includes('FROM invoices') && q.includes('FOR UPDATE'),
        );
        const dupCheckIdx = executedQueries.findIndex(q => q.includes('SELECT id FROM payments'));

        expect(orderLockIdx).toBeGreaterThan(-1);
        expect(invoiceLockIdx).toBeGreaterThan(orderLockIdx);
        expect(dupCheckIdx).toBeGreaterThan(invoiceLockIdx);
        expect(executedQueries.some(q => q.startsWith('UPDATE invoices'))).toBe(false);
    });

    it('rejects online provider settlement when matchedOrder is not registered for the tenant', async () => {
        mockClientQuery.mockImplementation(async (sqlText: string) => {
            const normalized = sqlText.replace(/\s+/g, ' ').trim();
            if (normalized === 'BEGIN' || normalized === 'ROLLBACK') {
                return { rows: [] };
            }
            if (normalized.includes('FROM payment_orders')) {
                return { rows: [] };
            }
            throw new Error(`Unexpected query: ${normalized}`);
        });

        await expect(
            completeProviderPayment({
                tenantId: TENANT_ID,
                invoiceId: INVOICE_ID,
                provider: 'STRIPE',
                providerOrderId: 'cs_unregistered_999',
                providerPaymentId: 'pi_999',
                amountMinor: 10000,
                currency: 'INR',
            }),
        ).rejects.toThrow('Provider payment order is not registered for this tenant');
    });

    it('handles PostgreSQL 23505 unique violation inside SAVEPOINT idempotently without double-crediting invoices.paid_amount', async () => {
        const executedQueries: string[] = [];

        mockClientQuery.mockImplementation(async (sqlText: string) => {
            const normalized = sqlText.replace(/\s+/g, ' ').trim();
            executedQueries.push(normalized);

            if (
                normalized === 'BEGIN' ||
                normalized === 'COMMIT' ||
                normalized === 'SAVEPOINT sp_insert_provider_payment' ||
                normalized === 'ROLLBACK TO SAVEPOINT sp_insert_provider_payment'
            ) {
                return { rows: [] };
            }
            if (normalized.includes('FROM payment_orders') && normalized.includes('FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: 'ord-row-2',
                            tenantId: TENANT_ID,
                            invoiceId: INVOICE_ID,
                            studentId: STUDENT_ID,
                            provider: 'RAZORPAY',
                            providerOrderId: 'order_race_1',
                            providerPaymentId: null,
                            amount: '250.00',
                            amountMinor: 25000,
                            currency: 'INR',
                            status: 'CREATED',
                            idempotencyKey: `RAZORPAY:${INVOICE_ID}:25000:INR`,
                        },
                    ],
                };
            }
            if (normalized.includes('FROM invoices') && normalized.includes('FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: INVOICE_ID,
                            tenantId: TENANT_ID,
                            studentId: STUDENT_ID,
                            invoiceNumber: 'INV-2026-002',
                            totalAmount: '500.00',
                            paidAmount: '0.00',
                            status: 'PENDING',
                        },
                    ],
                };
            }
            if (
                normalized.includes('SELECT id FROM payments') &&
                !normalized.includes('idempotency_key')
            ) {
                return { rows: [] };
            }
            if (normalized.startsWith('INSERT INTO payments')) {
                const uniqueErr = new Error('duplicate key value violates unique constraint') as Error & {
                    code: string;
                };
                uniqueErr.code = '23505';
                throw uniqueErr;
            }
            if (
                normalized.includes('SELECT id FROM payments') &&
                normalized.includes('idempotency_key')
            ) {
                return { rows: [{ id: 'pay-winner-777' }] };
            }
            throw new Error(`Unexpected query: ${normalized}`);
        });

        const outcome = await completeProviderPayment({
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            provider: 'RAZORPAY',
            providerOrderId: 'order_race_1',
            providerPaymentId: 'pay_race_1',
            amountMinor: 25000,
            currency: 'INR',
        });

        expect(outcome).toEqual({
            paymentId: 'pay-winner-777',
            alreadyProcessed: true,
            duplicate: true,
        });
        expect(executedQueries).toContain('SAVEPOINT sp_insert_provider_payment');
        expect(executedQueries).toContain('ROLLBACK TO SAVEPOINT sp_insert_provider_payment');
        expect(executedQueries.some(q => q.startsWith('UPDATE invoices'))).toBe(false);
        expect(executedQueries.some(q => q.startsWith('INSERT INTO receipts'))).toBe(false);
    });

    it('returns existing manual payment idempotently when idempotencyKey matches', async () => {
        mockClientQuery.mockImplementation(async (sqlText: string) => {
            const normalized = sqlText.replace(/\s+/g, ' ').trim();
            if (normalized === 'BEGIN' || normalized === 'COMMIT') return { rows: [] };
            if (normalized.includes('FROM invoices') && normalized.includes('FOR UPDATE')) {
                return {
                    rows: [
                        {
                            id: INVOICE_ID,
                            tenantId: TENANT_ID,
                            studentId: STUDENT_ID,
                            invoiceNumber: 'INV-2026-003',
                            totalAmount: '1000.00',
                            paidAmount: '500.00',
                            status: 'PARTIAL',
                        },
                    ],
                };
            }
            if (normalized.includes('FROM payments p') && normalized.includes('p.idempotency_key')) {
                return {
                    rows: [
                        {
                            paymentId: 'manual-pay-1',
                            receiptId: 'rcp-id-1',
                            receiptNumber: 'RCP-EXISTING-01',
                        },
                    ],
                };
            }
            throw new Error(`Unexpected query: ${normalized}`);
        });

        const res = await recordManualPayment({
            tenantId: TENANT_ID,
            invoiceId: INVOICE_ID,
            amount: 500,
            method: 'CASH',
            actorUserId: USER_ID,
            idempotencyKey: 'cash-counter-idem-001',
        });

        expect(res).toEqual({
            paymentId: 'manual-pay-1',
            receiptId: 'rcp-id-1',
            receiptNumber: 'RCP-EXISTING-01',
            duplicate: true,
        });
    });
});

describe('CRIT-02, MED-02 & HIGH-07: LCNC Metadata Engine Ledger Lock, Platform Admin Guard & Maker-Checker', () => {
    function setupMetadataMock(params: {
        apiName: string;
        tableName: string;
        isCustomObject?: boolean;
        fields: Array<{
            id: string;
            apiName: string;
            label: string;
            dataType: string;
            isCustom: boolean;
            isRequired?: boolean;
            picklistOptions?: string[];
            validationRules?: Record<string, unknown>;
            permissions?: Array<{ role: string; canRead?: boolean; canWrite?: boolean }>;
        }>;
        role?: string;
        userId?: string;
        extraSqlHandler?: (queryText: string, values: unknown[]) => unknown;
    }) {
        const callerRole = params.role || 'SCHOOL_ADMIN';
        const callerUserId = params.userId || USER_ID;
        mockRequireAuth.mockResolvedValue({
            tenantId: TENANT_ID,
            userId: callerUserId,
            session: {
                userId: callerUserId,
                tenantId: TENANT_ID,
                role: callerRole,
            },
        });

        mockSqlHandler.mockImplementation((queryText: string, values: unknown[]) => {
            if (params.extraSqlHandler) {
                const custom = params.extraSqlHandler(queryText, values);
                if (custom !== undefined) return custom;
            }
            if (queryText.includes('FROM metadata_objects')) {
                return [
                    {
                        id: 'obj-uuid-1',
                        tenantId: TENANT_ID,
                        name: params.apiName,
                        apiName: params.apiName,
                        tableName: params.tableName,
                        isCustom: Boolean(params.isCustomObject),
                        status: 'PUBLISHED',
                        version: 1,
                        publishedVersion: 1,
                    },
                ];
            }
            if (queryText.includes('FROM metadata_fields')) {
                return params.fields.map(f => ({
                    id: f.id,
                    objectId: 'obj-uuid-1',
                    label: f.label,
                    apiName: f.apiName,
                    dataType: f.dataType,
                    isCustom: f.isCustom,
                    isRequired: Boolean(f.isRequired),
                    defaultValue: null,
                    picklistOptions: f.picklistOptions || [],
                    validationRules: f.validationRules || {},
                    status: 'ACTIVE',
                    version: 1,
                    permissions: f.permissions || [],
                }));
            }
            if (queryText.includes('FROM metadata_layouts')) {
                return [];
            }
            if (queryText.includes('FROM metadata_workflows')) {
                return [];
            }
            return [];
        });
    }

    it('defines immutable protected ledger/identity tables and protected legacy plaintext columns', () => {
        for (const table of ['invoices', 'payments', 'payment_orders', 'concessions', 'receipts', 'users']) {
            expect(LEDGER_AND_IDENTITY_PROTECTED_TABLES.has(table)).toBe(true);
        }
        for (const col of ['aadhaar_number', 'pan_number', 'bank_account', 'password_hash', 'mfa_secret', 'session_version']) {
            expect(PROTECTED_LEGACY_PLAINTEXT_COLUMNS.has(col)).toBe(true);
        }
    });

    it('rejects record creation, standard-column mutations, bulk imports, and deletions on invoices, payments, and users', async () => {
        for (const [apiName, tableName, stdCol] of [
            ['invoice', 'invoices', 'paid_amount'],
            ['payment', 'payments', 'amount'],
            ['user_account', 'users', 'role'],
        ] as const) {
            setupMetadataMock({
                apiName,
                tableName,
                fields: [
                    {
                        id: `fld-${stdCol}`,
                        apiName: stdCol,
                        label: stdCol,
                        dataType: 'TEXT',
                        isCustom: false,
                    },
                    {
                        id: 'fld-custom-note',
                        apiName: 'finance_tag',
                        label: 'Finance Tag',
                        dataType: 'TEXT',
                        isCustom: true,
                    },
                ],
            });

            const createRes = await upsertRecord(apiName, { finance_tag: 'VIP' });
            expect(createRes).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.stringMatching(/protected ledger\/identity table/i),
                }),
            );

            const stdUpdateRes = await upsertRecord(apiName, { [stdCol]: '99999' }, RECORD_ID);
            expect(stdUpdateRes).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.stringMatching(/standard-column updates on protected ledger\/identity table/i),
                }),
            );

            const inlineRes = await updateRecordFieldValue(apiName, RECORD_ID, stdCol, '99999');
            expect(inlineRes).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.stringMatching(/protected ledger\/identity table/i),
                }),
            );

            const bulkRes = await bulkImportRecords(apiName, [{ finance_tag: 'Batch' }]);
            expect(bulkRes.success).toBe(false);
            expect(bulkRes.errors[0]).toMatch(/protected ledger\/identity table/i);

            const delRes = await deleteRecord(apiName, RECORD_ID);
            expect(delRes).toEqual(
                expect.objectContaining({
                    success: false,
                    error: expect.stringMatching(/protected ledger\/identity table/i),
                }),
            );
        }
        expect(mockPoolQuery).not.toHaveBeenCalled();
    });

    it('allows custom_data JSONB field updates on protected tables when authorized', async () => {
        setupMetadataMock({
            apiName: 'invoice',
            tableName: 'invoices',
            fields: [
                {
                    id: 'fld-custom-tag',
                    apiName: 'billing_notes_custom',
                    label: 'Billing Notes Custom',
                    dataType: 'TEXT',
                    isCustom: true,
                },
            ],
        });

        const res = await updateRecordFieldValue(
            'invoice',
            RECORD_ID,
            'billing_notes_custom',
            'Reviewed by bursar',
        );
        expect(res).toEqual({ success: true });
    });

    it('blocks permanent platform owner email during staff metadata provisioning (MED-02)', async () => {
        setupMetadataMock({
            apiName: 'staff',
            tableName: 'staff_profiles',
            fields: [
                {
                    id: 'fld-emp-id',
                    apiName: 'employee_id',
                    label: 'Employee ID',
                    dataType: 'TEXT',
                    isCustom: false,
                    isRequired: true,
                },
            ],
        });

        const res = await upsertRecord('staff', {
            employee_id: 'EMP-001',
            email: 'singhaditya21@gmail.com',
        });
        expect(res).toEqual({
            success: false,
            error: 'Reserved platform owner email cannot be provisioned as tenant staff.',
        });
    });

    it('blocks maker-checker self-approval in decideRecordApproval (HIGH-07)', async () => {
        setupMetadataMock({
            apiName: 'scholarship_request',
            tableName: 'metadata_records',
            isCustomObject: true,
            role: 'PRINCIPAL',
            userId: USER_ID,
            fields: [
                {
                    id: 'fld-status',
                    apiName: 'approval_status',
                    label: 'Approval Status',
                    dataType: 'PICKLIST',
                    isCustom: true,
                    picklistOptions: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
                },
            ],
            extraSqlHandler: (queryText: string) => {
                if (queryText.includes('FROM audit_logs')) {
                    return [
                        {
                            user_id: USER_ID,
                            after_state: {
                                auditEvent: 'RECORD_APPROVAL_REQUESTED',
                                submittedBy: USER_ID,
                            },
                        },
                    ];
                }
                return undefined;
            },
        });

        const decision = await decideRecordApproval(
            'scholarship_request',
            RECORD_ID,
            'APPROVED',
            'Self-approving my own request',
        );
        expect(decision).toEqual({
            success: false,
            error: 'Maker-checker violation: submitter cannot approve their own record.',
        });
    });

    it('prevents ROLLUP_SUMMARY from leaking unreadable child fields via FLS (HIGH-07)', async () => {
        mockRequireAuth.mockResolvedValue({
            tenantId: TENANT_ID,
            userId: USER_ID,
            session: {
                userId: USER_ID,
                tenantId: TENANT_ID,
                role: 'TEACHER',
            },
        });

        mockSqlHandler.mockImplementation((queryText: string, values: unknown[]) => {
            if (queryText.includes('FROM metadata_objects')) {
                const requestedApi = String(values[0]);
                if (requestedApi === 'department_budget') {
                    return [
                        {
                            id: 'obj-parent',
                            tenantId: TENANT_ID,
                            name: 'Department Budget',
                            apiName: 'department_budget',
                            tableName: 'metadata_records',
                            isCustom: true,
                            status: 'PUBLISHED',
                            version: 1,
                        },
                    ];
                }
                if (requestedApi === 'confidential_grant') {
                    return [
                        {
                            id: 'obj-child',
                            tenantId: TENANT_ID,
                            name: 'Confidential Grant',
                            apiName: 'confidential_grant',
                            tableName: 'metadata_records',
                            isCustom: true,
                            status: 'PUBLISHED',
                            version: 1,
                        },
                    ];
                }
            }
            if (queryText.includes('FROM metadata_fields')) {
                const objId = String(values[0]);
                if (objId === 'obj-parent') {
                    return [
                        {
                            id: 'fld-title',
                            objectId: 'obj-parent',
                            label: 'Title',
                            apiName: 'title',
                            dataType: 'TEXT',
                            isCustom: true,
                            isRequired: false,
                            picklistOptions: [],
                            validationRules: {},
                            status: 'ACTIVE',
                            version: 1,
                            permissions: [{ role: 'TEACHER', canRead: true, canWrite: false }],
                        },
                        {
                            id: 'fld-rollup',
                            objectId: 'obj-parent',
                            label: 'Total Secret Grants',
                            apiName: 'total_secret_grants',
                            dataType: 'NUMBER',
                            isCustom: true,
                            isRequired: false,
                            picklistOptions: [],
                            validationRules: {
                                fieldSubType: 'ROLLUP_SUMMARY',
                                rollupChildObject: 'confidential_grant',
                                rollupForeignKeyField: 'budget_id',
                                rollupAggregate: 'SUM',
                                rollupTargetField: 'secret_amount',
                            },
                            status: 'ACTIVE',
                            version: 1,
                            permissions: [{ role: 'TEACHER', canRead: true, canWrite: false }],
                        },
                    ];
                }
                if (objId === 'obj-child') {
                    return [
                        {
                            id: 'fld-fk',
                            objectId: 'obj-child',
                            label: 'Budget',
                            apiName: 'budget_id',
                            dataType: 'TEXT',
                            isCustom: true,
                            isRequired: false,
                            picklistOptions: [],
                            validationRules: {},
                            status: 'ACTIVE',
                            version: 1,
                            permissions: [{ role: 'TEACHER', canRead: true, canWrite: false }],
                        },
                        {
                            id: 'fld-secret',
                            objectId: 'obj-child',
                            label: 'Secret Amount',
                            apiName: 'secret_amount',
                            dataType: 'CURRENCY',
                            isCustom: true,
                            isRequired: false,
                            picklistOptions: [],
                            validationRules: {},
                            status: 'ACTIVE',
                            version: 1,
                            permissions: [{ role: 'TEACHER', canRead: false, canWrite: false }],
                        },
                    ];
                }
            }
            return [];
        });

        mockPoolQuery.mockImplementation(async (sqlText: string, values?: unknown[]) => {
            const objId = values?.[0];
            if (sqlText.includes('FROM metadata_records') && objId === 'obj-parent') {
                return {
                    rows: [
                        {
                            record_id: RECORD_ID,
                            created_at: '2026-04-01',
                            updated_at: '2026-04-01',
                            field_api_name: 'title',
                            data_type: 'TEXT',
                            value_string: 'Science Dept',
                            value_number: null,
                            value_boolean: null,
                            value_date: null,
                        },
                    ],
                };
            }
            if (sqlText.includes('FROM metadata_records') && objId === 'obj-child') {
                return {
                    rows: [
                        {
                            record_id: 'child-rec-1',
                            created_at: '2026-04-01',
                            updated_at: '2026-04-01',
                            field_api_name: 'budget_id',
                            data_type: 'TEXT',
                            value_string: RECORD_ID,
                            value_number: null,
                            value_boolean: null,
                            value_date: null,
                        },
                        {
                            record_id: 'child-rec-1',
                            created_at: '2026-04-01',
                            updated_at: '2026-04-01',
                            field_api_name: 'secret_amount',
                            data_type: 'CURRENCY',
                            value_string: null,
                            value_number: '999999',
                            value_boolean: null,
                            value_date: null,
                        },
                    ],
                };
            }
            return { rows: [] };
        });

        const rows = await queryRecords('department_budget');
        expect(rows).toHaveLength(1);
        expect(rows[0].total_secret_grants).toBe(0);
    });
});

describe('MED-08: CSV Formula Injection Sanitization & Legacy Importer Hardening', () => {
    it('neutralizes leading whitespace/control-prefixed formula payloads while preserving negative numbers', () => {
        expect(sanitizeCsvValue('\n=CMD()')).toBe('"\'\n=CMD()"');
        expect(sanitizeCsvValue(' =1+1')).toBe("' =1+1");
        expect(sanitizeCsvValue('\t+SUM(A1:A2)')).toBe("'\t+SUM(A1:A2)");
        expect(sanitizeCsvValue('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
        expect(sanitizeCsvValue('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
        expect(sanitizeCsvValue('|calc')).toBe("'|calc");

        // Legitimate negative numbers must remain unprefixed numeric strings
        expect(sanitizeCsvValue('-1250.50')).toBe('-1250.50');
        expect(sanitizeCsvValue(-42)).toBe('-42');
        expect(sanitizeCsvValue('Normal Text')).toBe('Normal Text');
    });

    it('strips leading formula characters from imported student and guardian names in legacy ERP parser', () => {
        const normalized = normalizeLegacyRow(
            {
                Adm_No: 'ENT-900',
                Pupil_Name: '  =CMD() Aarav Sharma',
                DOB: '14/06/2014',
                Gender: 'Male',
                Class_Section: 'Grade 6 - A',
                Father_Name: '\t+SUM(1,2) Rajesh Sharma',
                Father_Mobile: '9811223344',
            },
            {
                admissionNumber: 'Adm_No',
                fullName: 'Pupil_Name',
                dateOfBirth: 'DOB',
                gender: 'Gender',
                gradeName: 'Class_Section',
                guardianName: 'Father_Name',
                guardianPhone: 'Father_Mobile',
            },
            2,
        );

        expect(normalized.firstName.startsWith('=')).toBe(false);
        expect(normalized.guardianFirstName?.startsWith('+')).toBe(false);
        expect(normalized.guardianFirstName?.startsWith('\t')).toBe(false);
    });
});

describe('MED-11 & HIGH-08: Unified R2/S3 Storage Config, 128-bit DocGen Stamp & Teacher Document Scope', () => {
    const ORIGINAL_ENV = { ...process.env };

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('deterministically resolves R2 before AWS S3 across upload and presigned download when both are configured', () => {
        process.env.R2_ACCOUNT_ID = 'cfacct123';
        process.env.R2_ACCESS_KEY_ID = 'r2_access_key';
        process.env.R2_SECRET_ACCESS_KEY = 'r2_secret_key';
        process.env.R2_BUCKET_NAME = 'school-r2-bucket';
        process.env.AWS_S3_BUCKET = 'school-aws-bucket';
        process.env.AWS_ACCESS_KEY_ID = 'aws_access_key';
        process.env.AWS_SECRET_ACCESS_KEY = 'aws_secret_key';
        process.env.AWS_REGION = 'ap-south-1';

        const r2Resolved = resolveObjectStorageConfig();
        expect(r2Resolved?.provider).toBe('r2');
        expect(r2Resolved?.bucket).toBe('school-r2-bucket');

        const presignedR2 = createPresignedObjectUrl(`${TENANT_ID}/documents/report.pdf`);
        expect(presignedR2).toContain('cfacct123.r2.cloudflarestorage.com/school-r2-bucket/');

        delete process.env.R2_ACCOUNT_ID;
        const s3Resolved = resolveObjectStorageConfig();
        expect(s3Resolved?.provider).toBe('s3');
        expect(s3Resolved?.bucket).toBe('school-aws-bucket');

        const presignedS3 = createPresignedObjectUrl(`${TENANT_ID}/documents/report.pdf`);
        expect(presignedS3).toContain('school-aws-bucket.s3.ap-south-1.amazonaws.com/');
    });

    it('emits 128-bit (32-hex-char) HMAC verification codes in DocGen and rejects weak secrets in production', () => {
        process.env.DOCUMENT_STAMP_SECRET = 'super-strong-document-stamp-secret-2026-key';
        const rendered = renderMetadataDocumentTemplate(
            {
                id: 'tpl-bonafide',
                name: 'Bonafide Certificate',
                category: 'BONAFIDE_CERTIFICATE',
                headerTitle: 'Bonafide Certificate',
                bodyMarkdown: 'Certifying {{ student_name }}',
                includeVerificationBadge: true,
            },
            { student_name: 'Ananya Verma' },
            {
                objectName: 'Student',
                recordId: RECORD_ID,
                issuedDate: '2026-11-12',
            },
        );

        expect(rendered.verificationCode).toMatch(/^SM-DOC-2026-[0-9A-F]{32}$/);

        const mutableEnv = process.env as Record<string, string | undefined>;
        mutableEnv.NODE_ENV = 'production';
        delete mutableEnv.DOCUMENT_STAMP_SECRET;
        delete mutableEnv.SESSION_SECRET;
        delete mutableEnv.DOCUMENT_VERIFICATION_SECRET;

        expect(() =>
            renderMetadataDocumentTemplate(
                {
                    id: 'tpl-bonafide',
                    name: 'Bonafide Certificate',
                    category: 'BONAFIDE_CERTIFICATE',
                    headerTitle: 'Bonafide Certificate',
                    bodyMarkdown: 'Certifying {{ student_name }}',
                    includeVerificationBadge: true,
                },
                { student_name: 'Ananya Verma' },
                {
                    objectName: 'Student',
                    recordId: RECORD_ID,
                    issuedDate: '2026-11-12',
                },
            ),
        ).toThrow(/at least 32 characters in production/i);
    });

    it('restricts TEACHER student document access to assigned sections only (HIGH-08)', async () => {
        mockPoolQuery
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // teacher section check
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // guardian check
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // self student check

        const unassigned = await canAccessStudentDocument({
            tenantId: TENANT_ID,
            userId: USER_ID,
            role: 'TEACHER',
            studentId: STUDENT_ID,
            staffPermission: 'students:read',
        });
        expect(unassigned).toBe(false);

        mockPoolQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 });
        const assigned = await canAccessStudentDocument({
            tenantId: TENANT_ID,
            userId: USER_ID,
            role: 'TEACHER',
            studentId: STUDENT_ID,
            staffPermission: 'students:read',
        });
        expect(assigned).toBe(true);
    });
});
