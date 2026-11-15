import fs from 'node:fs';
import path from 'node:path';
import { register } from 'prom-client';
import * as generatedTables from '../../../../packages/api/src/db/generated/tables';
import { BACKFILL_TARGETS } from '../../scripts/backfill-encrypt-pii-identifiers';
import { ROTATION_TARGETS } from '../../scripts/rotate-pii-encryption';
import {
    decryptFieldTolerant,
    decryptStrict,
    getPiiEncryptionKeyStatus,
} from '@/lib/encryption';
import { isProtectedLegacyPlaintextColumn } from '@/lib/metadata/access-control';
import {
    LIVE_NOTIFICATION_PROVIDERS,
    SUPPORTED_NOTIFICATION_PROVIDERS,
    describeChannelReadiness,
} from '@/lib/notifications/channels';
import {
    initializeAppMetrics,
    recordLeadCaptureOutcome,
} from '@/lib/observability/metrics';

describe('PII rollout completeness, notification channel readiness & lead observability', () => {
    const originalKey = process.env.PII_ENCRYPTION_KEY;

    beforeAll(() => {
        process.env.PII_ENCRYPTION_KEY =
            process.env.PII_ENCRYPTION_KEY ||
            'unit-test-pii-encryption-secret-key-at-least-32-chars';
    });

    afterAll(() => {
        if (originalKey === undefined) {
            delete process.env.PII_ENCRYPTION_KEY;
        } else {
            process.env.PII_ENCRYPTION_KEY = originalKey;
        }
    });

    it('covers every *_enc column in generated/tables.ts across both backfill and rotation scripts', () => {
        const schemaEncryptedColumns: string[] = [];

        for (const value of Object.values(generatedTables)) {
            if (!value || typeof value !== 'object' || !('$name' in value)) continue;
            const tableObj = value as Record<string, unknown> & { $name: string };
            for (const col of Object.values(tableObj)) {
                if (
                    col &&
                    typeof col === 'object' &&
                    'column' in col &&
                    typeof (col as { column: unknown }).column === 'string'
                ) {
                    const colName = (col as { column: string }).column;
                    if (colName.endsWith('_enc')) {
                        schemaEncryptedColumns.push(`${tableObj.$name}.${colName}`);
                    }
                }
            }
        }

        schemaEncryptedColumns.sort();
        expect(schemaEncryptedColumns.length).toBeGreaterThanOrEqual(22);

        const backfillSet = new Set(BACKFILL_TARGETS.map((t) => `${t.table}.${t.enc}`));
        const rotationSet = new Set(ROTATION_TARGETS.map((t) => `${t.table}.${t.column}`));

        for (const tableCol of schemaEncryptedColumns) {
            expect(backfillSet.has(tableCol)).toBe(true);
            expect(rotationSet.has(tableCol)).toBe(true);
        }
    });

    it('produces ciphertexts matching currentPrefix and round-tripping through decryptStrict for all ROTATION_TARGETS', () => {
        const { currentKeyId } = getPiiEncryptionKeyStatus();

        for (const target of ROTATION_TARGETS) {
            const sample = target.column.includes('email')
                ? 'Principal.Office@School.EDU.IN'
                : target.column.includes('phone')
                  ? '+91 98765-43210'
                  : 'abcde1234f';
            const ciphertext = target.encrypt(sample);
            const expectedPrefix = target.currentPrefix(currentKeyId);

            expect(ciphertext.startsWith(expectedPrefix)).toBe(true);
            const decrypted = decryptStrict(ciphertext);
            expect(decrypted.length).toBeGreaterThan(0);
            expect(decryptFieldTolerant(ciphertext)).toBe(decrypted);
        }
    });

    it('quarantines all legacy plaintext PII columns from LCNC metadata exposure', () => {
        for (const col of [
            'email',
            'phone',
            'pan_number',
            'bank_account',
            'parent_email',
            'parent_phone',
            'contact_email',
            'recipient_email',
            'recipient_phone',
        ]) {
            expect(isProtectedLegacyPlaintextColumn(col)).toBe(true);
        }
    });

    it('includes Meta Cloud, WAHA, and Evolution WhatsApp adapters in live channel readiness (#25)', () => {
        expect(SUPPORTED_NOTIFICATION_PROVIDERS.WHATSAPP).toEqual(
            expect.arrayContaining(['meta_cloud', 'waha', 'evolution', 'mock']),
        );
        expect(LIVE_NOTIFICATION_PROVIDERS.WHATSAPP).toEqual(
            expect.arrayContaining(['meta_cloud', 'waha', 'evolution']),
        );

        const wahaReady = describeChannelReadiness('WHATSAPP', {
            NODE_ENV: 'production',
            WHATSAPP_PROVIDER: 'waha',
            WAHA_BASE_URL: 'https://waha.campus.example.edu',
        } as unknown as NodeJS.ProcessEnv);
        expect(wahaReady.available).toBe(true);
        expect(wahaReady.provider).toBe('waha');
    });

    it('tracks lead-capture outcomes in Prometheus and ships matching alert rules + CRM script (#31)', async () => {
        initializeAppMetrics();
        recordLeadCaptureOutcome('accepted');
        recordLeadCaptureOutcome('bot_screened');
        recordLeadCaptureOutcome('rate_limited');

        const metric = register.getSingleMetric('school_sis_lead_capture_requests_total');
        expect(metric).toBeDefined();
        const metricJson = await metric!.get();
        const acceptedSample = metricJson.values.find((v) => v.labels.outcome === 'accepted');
        expect(acceptedSample?.value).toBeGreaterThanOrEqual(1);

        const repoRoot = path.resolve(__dirname, '../../../..');
        const alertsYaml = fs.readFileSync(
            path.join(repoRoot, 'ops/observability/prometheus/lead-capture-alerts.yml'),
            'utf8',
        );
        expect(alertsYaml).toContain('school_sis_lead_capture_requests_total');
        expect(alertsYaml).toContain('school_sis_marketing_leads_crm');

        const appsScript = fs.readFileSync(
            path.join(repoRoot, 'ops/crm/google-apps-script-lead-webhook.gs'),
            'utf8',
        );
        expect(appsScript).toContain('computeHmacSha256Signature');
        expect(appsScript).toContain('Unauthorized webhook request.');
    });
});
