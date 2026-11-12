jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
    sql: jest.fn(),
    sqlFor: jest.fn(),
    withTenant: jest.fn(),
    runWithTenantContext: jest.fn(),
    runWithRlsBypass: jest.fn(),
    RLS_BYPASS_JUSTIFICATIONS: {
        COMPANY_GROUP_ROLLUP: { id: 'analytics.company-group-rollup', reason: 'test' },
        NOTIFICATION_RECEIPT: { id: 'notifications.provider-receipt-lookup', reason: 'test' },
    },
}));

import {
    getWhatsAppProvider,
    resetWhatsAppProviderCache,
    whatsAppAvailability,
} from '@/lib/providers/whatsapp';
import { parseInboundWhatsAppMessages } from '@/lib/concierge/whatsapp-concierge';
import { resolveAiProvider, resolveAiProviderChain } from '@/lib/ai/provider';
import { classifyCampusHealth } from '@/lib/actions/executive-analytics';
import {
    buildErpNextJson,
    buildTallyPrimeXml,
    buildZohoBooksCsv,
    normalizeAccountingLedgerConfig,
    type AccountingPaymentRow,
} from '@/lib/integrations/accounting-vouchers';
import { scoreAdmissionLeadPropensity } from '@/lib/admissions/lead-scoring';
import { computeDefaulterRecoveryScore } from '@/components/fees/defaulter-dashboard';

describe('Phase 3 & Zero-Cost Production Stack Contracts', () => {
    const ORIGINAL_ENV = process.env;
    const ORIGINAL_FETCH = global.fetch;

    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV, NODE_ENV: 'production' };
        for (const k of [
            'WHATSAPP_PROVIDER',
            'WAHA_BASE_URL',
            'WAHA_API_KEY',
            'WAHA_SESSION',
            'EVOLUTION_BASE_URL',
            'EVOLUTION_API_KEY',
            'EVOLUTION_INSTANCE',
            'CEREBRAS_API_KEY',
            'GROQ_API_KEY',
            'GEMINI_API_KEY',
            'OPENAI_API_KEY',
            'OLLAMA_BASE_URL',
        ]) {
            delete process.env[k];
        }
        resetWhatsAppProviderCache();
        global.fetch = ORIGINAL_FETCH;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
        global.fetch = ORIGINAL_FETCH;
    });

    describe('Open-Source Self-Hosted WhatsApp Adapters (WAHA & Evolution API)', () => {
        it('dispatches plain-text WhatsApp via self-hosted devlikeapro/waha', async () => {
            process.env.WHATSAPP_PROVIDER = 'waha';
            process.env.WAHA_BASE_URL = 'https://waha.school.edu.in';
            process.env.WAHA_API_KEY = 'secret-waha-key';
            process.env.WAHA_SESSION = 'campus-main';

            expect(whatsAppAvailability().available).toBe(true);

            const fetchMock = jest.fn().mockResolvedValue(
                new Response(JSON.stringify({ id: 'true_919810012345@c.us_3EB0ABCD' }), {
                    status: 201,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );
            global.fetch = fetchMock as unknown as typeof fetch;

            const result = await getWhatsAppProvider().send({
                to: '+91 98100 12345',
                body: 'Namaste! Your Term 2 fee receipt is ready.',
            });

            expect(result.success).toBe(true);
            expect(result.data?.messageId).toBe('true_919810012345@c.us_3EB0ABCD');
            expect(result.data?.deliveryState).toBe('ACCEPTED');

            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('https://waha.school.edu.in/api/sendText');
            expect((init as RequestInit).headers).toMatchObject({
                'X-Api-Key': 'secret-waha-key',
            });
            expect(JSON.parse(String((init as RequestInit).body))).toEqual({
                session: 'campus-main',
                chatId: '919810012345@c.us',
                text: 'Namaste! Your Term 2 fee receipt is ready.',
            });
        });

        it('dispatches plain-text WhatsApp via self-hosted Evolution API', async () => {
            process.env.WHATSAPP_PROVIDER = 'evolution';
            process.env.EVOLUTION_BASE_URL = 'https://evo.school.edu.in';
            process.env.EVOLUTION_API_KEY = 'evo-key-123';
            process.env.EVOLUTION_INSTANCE = 'scholarmind';

            expect(whatsAppAvailability().available).toBe(true);

            const fetchMock = jest.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        key: { remoteJid: '919810012345@s.whatsapp.net', id: 'BAE5998811' },
                    }),
                    { status: 201, headers: { 'Content-Type': 'application/json' } },
                ),
            );
            global.fetch = fetchMock as unknown as typeof fetch;

            const result = await getWhatsAppProvider().send({
                to: '9810012345',
                body: 'Gate pass verified.',
            });

            expect(result.success).toBe(true);
            expect(result.data?.messageId).toBe('BAE5998811');
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('https://evo.school.edu.in/message/sendText/scholarmind');
            expect((init as RequestInit).headers).toMatchObject({ apikey: 'evo-key-123' });
        });

        it('parses inbound WAHA and Evolution API guardian messages while ignoring group chats', () => {
            const wahaInbound = parseInboundWhatsAppMessages({
                event: 'message',
                session: 'default',
                payload: {
                    id: 'waha_msg_1',
                    from: '919810012345@c.us',
                    fromMe: false,
                    body: '1',
                },
            });
            expect(wahaInbound).toEqual([
                {
                    messageId: 'waha_msg_1',
                    fromDigits: '919810012345',
                    text: '1',
                    phoneNumberId: 'default',
                },
            ]);

            const wahaGroupIgnored = parseInboundWhatsAppMessages({
                event: 'message',
                payload: { id: 'g1', from: '12036304@g.us', fromMe: false, body: 'hello' },
            });
            expect(wahaGroupIgnored).toEqual([]);

            const evoInbound = parseInboundWhatsAppMessages({
                event: 'messages.upsert',
                instance: 'campus',
                data: {
                    key: {
                        remoteJid: '919820054321@s.whatsapp.net',
                        fromMe: false,
                        id: 'evo_msg_9',
                    },
                    message: {
                        extendedTextMessage: { text: 'Report card' },
                    },
                },
            });
            expect(evoInbound).toEqual([
                {
                    messageId: 'evo_msg_9',
                    fromDigits: '919820054321',
                    text: 'Report card',
                    phoneNumberId: 'campus',
                },
            ]);
        });
    });

    describe('Free Open-Weight & Local Self-Hosted AI Provider Chain', () => {
        it('supports Groq, Gemini Free Tier, and zero-key self-hosted Ollama', () => {
            process.env.GROQ_API_KEY = 'gsk_test';
            process.env.GEMINI_API_KEY = 'gem_test';
            process.env.OLLAMA_BASE_URL = 'http://localhost:11434/v1';

            const primary = resolveAiProvider();
            expect(primary.configured).toBe(true);
            expect(primary.config?.source).toBe('GROQ_API_KEY');
            expect(primary.config?.model).toBe('llama-3.3-70b-versatile');

            const chain = resolveAiProviderChain();
            expect(chain.configured).toBe(true);
            expect(chain.chain?.map((c) => c.source)).toEqual([
                'GROQ_API_KEY',
                'GEMINI_API_KEY',
                'OLLAMA_BASE_URL',
            ]);

            delete process.env.GROQ_API_KEY;
            delete process.env.GEMINI_API_KEY;
            const ollamaOnly = resolveAiProvider();
            expect(ollamaOnly.configured).toBe(true);
            expect(ollamaOnly.config?.source).toBe('OLLAMA_BASE_URL');
            expect(ollamaOnly.config?.apiKey).toBe('ollama');
        });
    });

    describe('Multi-Campus Health Classification & Zero-Cost Accounting Formatters', () => {
        it('classifies campus standing from realization, arrears, and attendance', () => {
            expect(
                classifyCampusHealth({
                    collectionRate: 86,
                    overdueBalance: 5000,
                    expectedFees: 100000,
                    attendanceRate: 95,
                }),
            ).toBe('EXEMPLARY');

            expect(
                classifyCampusHealth({
                    collectionRate: 48,
                    overdueBalance: 42000,
                    expectedFees: 100000,
                    attendanceRate: 91,
                }),
            ).toBe('INTERVENTION');
        });

        it('exports TallyPrime XML, Zoho Books CSV, and Frappe ERPNext JSON with custom ledger mappings', () => {
            const config = normalizeAccountingLedgerConfig({
                tallyCompanyName: 'Delhi Heritage Trust & Schools',
                receivableLedgerPrefix: 'Tuition Income',
                ledgerMappings: {
                    UPI: 'ICICI School UPI Pool',
                },
            });

            const samplePayments: AccountingPaymentRow[] = [
                {
                    id: '9f8e7d6c-1111-4222-8333-abcdef123456',
                    amount: '22500.00',
                    method: 'UPI',
                    paidAt: '2026-10-14T08:30:00.000Z',
                    providerReference: 'UTR998877',
                    invoiceNumber: 'INV-2026-001',
                    studentName: 'Aarav & Diya',
                    admissionNumber: 'ADM-101',
                    grade: 'Grade 6',
                },
            ];

            const xml = buildTallyPrimeXml(samplePayments, config);
            expect(xml).toContain('<SVCURRENTCOMPANY>Delhi Heritage Trust &amp; Schools</SVCURRENTCOMPANY>');
            expect(xml).toContain('<GUID>scholarmind-9f8e7d6c-1111-4222-8333-abcdef123456</GUID>');
            expect(xml).toContain('<LEDGERNAME>ICICI School UPI Pool</LEDGERNAME>');
            expect(xml).toContain('<LEDGERNAME>Tuition Income - Grade 6</LEDGERNAME>');
            expect(xml).toContain('<AMOUNT>-22500.00</AMOUNT>');

            const csv = buildZohoBooksCsv(samplePayments, config);
            const csvLines = csv.split('\n');
            expect(csvLines).toHaveLength(3); // Header + Debit + Credit
            expect(csvLines[1]).toContain('ICICI School UPI Pool');
            expect(csvLines[1]).toContain('22500.00,0.00,INR');
            expect(csvLines[2]).toContain('Tuition Income - Grade 6');
            expect(csvLines[2]).toContain('0.00,22500.00,INR');

            const erpJson = JSON.parse(buildErpNextJson(samplePayments, config));
            expect(erpJson.schema).toBe('frappe.erpnext.journal_entry.v1');
            expect(erpJson.entries[0].doctype).toBe('Journal Entry');
            expect(erpJson.entries[0].accounts[0]).toMatchObject({
                account: 'ICICI School UPI Pool',
                debit_in_account_currency: 22500,
            });
            expect(erpJson.entries[0].accounts[1]).toMatchObject({
                account: 'Tuition Income - Grade 6',
                credit_in_account_currency: 22500,
            });
        });
    });

    describe('AI Admissions Lead Propensity & Fee Defaulter Recovery Scoring', () => {
        it('ranks high-intent referral offers as HOT and generates bilingual WhatsApp scripts', () => {
            const hotLead = scoreAdmissionLeadPropensity(
                {
                    id: 'lead-1',
                    childFirstName: 'Reyansh',
                    childLastName: 'Malhotra',
                    childDob: '2014-03-18',
                    applyingForGrade: 'Grade 6',
                    parentName: 'Siddharth Malhotra',
                    parentEmail: 'siddharth@example.org',
                    parentPhone: '+91 98114 45566',
                    source: 'REFERRAL',
                    stage: 'OFFERED',
                    notes: 'Sibling alumni referral; ready for deposit',
                    previousSchool: 'Vasant Valley Junior School',
                    createdAt: new Date(),
                },
                'ScholarMind Heritage School',
            );

            expect(hotLead.tier).toBe('HOT');
            expect(hotLead.score).toBeGreaterThanOrEqual(80);
            expect(hotLead.whatsappDigits).toBe('919811445566');
            expect(hotLead.whatsappScripts.english).toContain('Reyansh');
            expect(hotLead.whatsappScripts.hindi).toContain('प्रवेश प्रस्ताव');

            const earlyLead = scoreAdmissionLeadPropensity({
                id: 'lead-2',
                childFirstName: 'Ishaan',
                childLastName: 'Goswami',
                applyingForGrade: 'Grade 8',
                parentName: 'Rajeev Goswami',
                source: 'ADVERTISEMENT',
                stage: 'NEW',
                createdAt: new Date(Date.now() - 45 * 86400 * 1000),
            });
            expect(earlyLead.tier).toBe('NURTURE');
            expect(earlyLead.score).toBeLessThan(hotLead.score);
        });

        it('scores partial-paying recent defaulters higher than chronic 120-day arrears', () => {
            const highYield = computeDefaulterRecoveryScore({
                studentId: 's1',
                studentName: 'Kabir Nair',
                className: 'Grade 10-A',
                totalDue: 22500,
                totalPaid: 7500,
                balance: 15000,
                daysOverdue: 22,
                invoiceCount: 1,
                oldestDueDate: '2026-10-20',
            });
            const chronic = computeDefaulterRecoveryScore({
                studentId: 's2',
                studentName: 'Ananya Iyer',
                className: 'Grade 10-A',
                totalDue: 22500,
                totalPaid: 0,
                balance: 22500,
                daysOverdue: 120,
                invoiceCount: 2,
                oldestDueDate: '2026-07-05',
            });

            expect(highYield.label).toBe('High Yield');
            expect(chronic.label).toBe('Principal Review');
            expect(highYield.score).toBeGreaterThan(chronic.score);
        });
    });
});
