import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    computeRecordSlaStatus,
    detectMetadataDuplicates,
    evaluateMetadataFormula,
    evaluateMetadataRollupSummary,
    evaluateMetadataVisibilityRule,
    generateMetadataAutoNumber,
    isSafeWebhookDestinationUrl,
    normalizeMetadataFieldInput,
    redactSensitiveWorkflowPayload,
    validateMetadataRecordPayload,
} from '@/lib/metadata/platform';
import {
    EDUCATION_BLUEPRINT_PACKS,
    getEducationBlueprintById,
} from '@/lib/metadata/blueprints';

function readWebSource(relativePath: string): string {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('LCNC & Drag-and-Drop Platform Builders', () => {
    it('exposes saveObjectLayout, updateFieldPermissions, updateRecordFieldValue, and live workflow action runners in metadata-engine.ts', () => {
        const source = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(source).toContain('export async function saveObjectLayout');
        expect(source).toContain('export async function updateFieldPermissions');
        expect(source).toContain('export async function updateRecordFieldValue');
        expect(source).toContain('export async function runSingleWorkflowAction');
        expect(source).toContain('export async function getLookupOptions');
        expect(source).toContain('export async function getRelatedLookupRecords');
        expect(source).toContain('async function executeMatchingWorkflows');
        expect(source).toContain("runner: 'FIELD_UPDATE'");
        expect(source).toContain("runner: 'CREATE_TASK'");
        expect(source).toContain("runner: 'SEND_EMAIL'");
        expect(source).toContain("runner: 'WEBHOOK'");
        expect(source).toContain('INSERT INTO notification_outbox');
        expect(source).toContain('INSERT INTO appointments');
        expect(source).toContain('INSERT INTO background_jobs');
        expect(source).toContain("INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)");
        expect(source).toContain("'WORKFLOW_EXECUTED'");

        const automationActions = readWebSource('src/lib/actions/automation.ts');
        expect(automationActions).toContain('export async function getWorkflowExecutions');
        expect(automationActions).toContain('export async function triggerWorkflowTestRun');
    });

    it('supports Relational Lookup (LOOKUP) and Calculated Formula (FORMULA) metadata fields', () => {
        const lookupField = normalizeMetadataFieldInput({
            label: 'Assigned Student',
            apiName: 'assigned_student_id',
            dataType: 'LOOKUP',
            validationRules: { lookupTargetObject: 'student' },
        });
        expect(lookupField.dataType).toBe('TEXT');
        expect(lookupField.validationRules.fieldSubType).toBe('LOOKUP');
        expect(lookupField.validationRules.lookupTargetObject).toBe('student');

        const formulaField = normalizeMetadataFieldInput({
            label: 'Total Fee Due',
            apiName: 'total_fee_due',
            dataType: 'FORMULA',
            validationRules: { formulaExpression: '{tuition} + {transport} - {discount}' },
        });
        expect(formulaField.dataType).toBe('NUMBER');
        expect(formulaField.validationRules.fieldSubType).toBe('FORMULA');
        expect(formulaField.validationRules.formulaExpression).toBe('{tuition} + {transport} - {discount}');

        // Evaluate arithmetic, CONCAT, and DAYS_BETWEEN formulas safely without eval()
        expect(
            evaluateMetadataFormula('{tuition} + {transport} - {discount}', {
                tuition: 50000,
                transport: 8000,
                discount: 3000,
            }),
        ).toBe(55000);

        expect(
            evaluateMetadataFormula("CONCAT(first_name, ' - ', grade)", {
                first_name: 'Aarav',
                grade: 'Grade 10',
            }),
        ).toBe('Aarav - Grade 10');

        // Formula fields should be skipped during write validation
        const validated = validateMetadataRecordPayload(
            [
                {
                    apiName: 'tuition',
                    label: 'Tuition',
                    dataType: 'NUMBER',
                    isRequired: true,
                    validationRules: {},
                },
                {
                    apiName: 'total_fee_due',
                    label: 'Total Fee Due',
                    dataType: 'NUMBER',
                    isRequired: false,
                    validationRules: {
                        fieldSubType: 'FORMULA',
                        formulaExpression: '{tuition} * 1.18',
                    },
                },
            ],
            { tuition: 10000, total_fee_due: 999999 },
        );
        expect(validated).toEqual({ ok: true, data: { tuition: '10000' } });
    });

    it('provides a Drag-and-Drop Form and List Layout Designer for metadata objects', () => {
        const layoutBuilder = readWebSource('src/app/(admin)/settings/objects/[id]/layout-builder.tsx');
        expect(layoutBuilder).toContain('draggable');
        expect(layoutBuilder).toContain('onDragStart');
        expect(layoutBuilder).toContain('onDrop');
        expect(layoutBuilder).toContain('saveObjectLayout');

        const objectPage = readWebSource('src/app/(admin)/settings/objects/[id]/page.tsx');
        expect(objectPage).toContain('ObjectLayoutBuilderClient');
    });

    it('provides an interactive Field-Level Security (FLS) role matrix in FieldManagerClient', () => {
        const fieldManager = readWebSource('src/app/(admin)/settings/objects/[id]/field-manager.tsx');
        expect(fieldManager).toContain('updateFieldPermissions');
        expect(fieldManager).toContain('FLS Matrix');
        expect(fieldManager).toContain('Save Role Permissions');
        expect(fieldManager).toContain('Relational Lookup (Parent Object)');
        expect(fieldManager).toContain('Calculated Formula (f(x))');
    });

    it('supports drag-and-drop Kanban boards in Admissions and Generic Metadata Objects', () => {
        const admissionsBoard = readWebSource('src/app/(admin)/admissions/admissions-pipeline-board.tsx');
        expect(admissionsBoard).toContain('draggable');
        expect(admissionsBoard).toContain('onDragOver');
        expect(admissionsBoard).toContain('onDrop');

        const genericList = readWebSource('src/app/(admin)/app/[object]/generic-list.tsx');
        expect(genericList).toContain('toggle-kanban-view');
        expect(genericList).toContain('updateRecordFieldValue');
        expect(genericList).toContain('draggable');
    });

    it('provides a visual drag-and-drop node canvas for Workflow Automation, Executive Dashboard Builder, and interactive Data Studio', () => {
        const workflowBuilder = readWebSource('src/components/automation/workflow-builder.tsx');
        expect(workflowBuilder).toContain('workflow-visual-canvas');
        expect(workflowBuilder).toContain('workflow-target-object-trigger');
        expect(workflowBuilder).toContain('availableObjects');
        expect(workflowBuilder).toContain('draggable');
        expect(workflowBuilder).toContain('onDrop={handleCanvasDrop}');

        const executiveDashboard = readWebSource('src/app/(dashboard)/executive/executive-dashboard-client.tsx');
        expect(executiveDashboard).toContain('toggle-customize-dashboard');
        expect(executiveDashboard).toContain('handleWidgetDrop');
        expect(executiveDashboard).toContain('draggable={isCustomizing}');

        const dataStudio = readWebSource('src/app/(dashboard)/data/data-studio-client.tsx');
        expect(dataStudio).toContain('handleColumnDrop');
        expect(dataStudio).toContain('handleInlineCellCommit');
        expect(dataStudio).toContain('saveObjectLayout');
        expect(dataStudio).toContain('studio-export-csv');
        expect(dataStudio).toContain('handleStudioDeleteRecord');
    });

    it('supports Track 2 record deletion lifecycle (object.record.deleted), CSV bulk import/export, and saved/scheduled BI reports', () => {
        const metadataEngine = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(metadataEngine).toContain('export async function deleteRecord');
        expect(metadataEngine).toContain("'object.record.deleted'");
        expect(metadataEngine).toContain("'METADATA_RECORD_DELETED'");
        expect(metadataEngine).toContain('export async function bulkImportRecords');
        expect(metadataEngine).toContain("'METADATA_BULK_IMPORT'");

        const genericList = readWebSource('src/app/(admin)/app/[object]/generic-list.tsx');
        expect(genericList).toContain('export-object-csv');
        expect(genericList).toContain('import-object-csv');
        expect(genericList).toContain('run-csv-bulk-import');
        expect(genericList).toContain('handleDeleteRecord');

        const biActions = readWebSource('src/app/(admin)/reports/bi-actions.ts');
        expect(biActions).toContain('export async function saveCustomReportDefinition');
        expect(biActions).toContain('export async function getSavedBiReports');
        expect(biActions).toContain("'BI_REPORT_SAVED'");
        expect(biActions).toContain("'BI_SCHEDULED_REPORT'");

        const reportBuilder = readWebSource('src/app/(admin)/reports/report-builder.tsx');
        expect(reportBuilder).toContain('save-schedule-report-panel');
        expect(reportBuilder).toContain('save-custom-report-btn');
    });

    it('provides /settings/integrations console with settings:read / settings:write RBAC and audit logging', () => {
        const actions = readWebSource('src/app/(admin)/settings/integrations/actions.ts');
        expect(actions).toContain('export async function getIntegrationsConsoleData');
        expect(actions).toContain("requireAuth('settings:read')");
        expect(actions).toContain('export async function sendTestChannelNotification');
        expect(actions).toContain("requireAuth('settings:write')");
        expect(actions).toContain("'NOTIFICATION_TEST_DISPATCH'");
        expect(actions).toContain('export async function retryOutboxNotification');
        expect(actions).toContain("'NOTIFICATION_OUTBOX_RETRY'");

        const client = readWebSource('src/app/(admin)/settings/integrations/integrations-client.tsx');
        expect(client).toContain('integrations-console');
        expect(client).toContain('outbox-table');
    });

    it('exposes /api/data object discovery, table-backed + formula evaluation on /api/data/[object_name], and mobile MetadataExplorerScreen', () => {
        const apiDataList = readWebSource('src/app/api/data/route.ts');
        expect(apiDataList).toContain('SELECT DISTINCT ON (api_name)');
        expect(apiDataList).toContain('FROM metadata_objects');
        expect(apiDataList).toContain('logAudit');

        const apiDataObject = readWebSource('src/app/api/data/[object_name]/route.ts');
        expect(apiDataObject).toContain('evaluateMetadataFormula');
        expect(apiDataObject).toContain('identifier(objectDef.tableName)');

        const authTokenRoute = readWebSource('src/app/api/auth/token/route.ts');
        expect(authTokenRoute).toContain('SET last_login_at = CURRENT_TIMESTAMP');
        expect(authTokenRoute).toContain('shouldRequireMfaEnrollment');

        const mobileExplorer = readFileSync(
            resolve(process.cwd(), '../mobile/screens/MetadataExplorerScreen.tsx'),
            'utf8',
        );
        expect(mobileExplorer).toContain('/api/data');
        expect(mobileExplorer).toContain('Dynamic Object Explorer');
    });

    it('provides Salesforce Education Cloud Institution Blueprints (K-12, College/University, Coaching Institute) and Roll-Up Summary fields', () => {
        expect(EDUCATION_BLUEPRINT_PACKS).toHaveLength(3);
        expect(getEducationBlueprintById('K12_SCHOOL_CLOUD')?.objects.map(o => o.apiName)).toEqual([
            'transport_allocation',
            'discipline_incident',
            'scholarship_grant',
        ]);
        expect(
            getEducationBlueprintById('COLLEGE_HIGHER_ED_CLOUD')?.objects.map(o => o.apiName),
        ).toEqual(['academic_program', 'semester_enrollment', 'placement_drive']);
        expect(
            getEducationBlueprintById('COACHING_INSTITUTE_CLOUD')?.objects.map(o => o.apiName),
        ).toEqual(['coaching_batch', 'coaching_inquiry', 'test_series_attempt']);

        // Roll-up summary field normalization & runtime evaluation
        const rollupField = normalizeMetadataFieldInput({
            label: 'Total Inquiries',
            apiName: 'total_inquiries',
            dataType: 'ROLLUP_SUMMARY',
            rollupChildObject: 'coaching_inquiry',
            rollupForeignKeyField: 'preferred_batch_id',
            rollupAggregate: 'COUNT',
        });
        expect(rollupField.dataType).toBe('NUMBER');
        expect(rollupField.isRequired).toBe(false);
        expect(rollupField.validationRules.fieldSubType).toBe('ROLLUP_SUMMARY');

        const childRows = [
            { credits_earned: 20 },
            { credits_earned: 24 },
            { credits_earned: 16 },
        ];
        expect(evaluateMetadataRollupSummary('COUNT', childRows)).toBe(3);
        expect(evaluateMetadataRollupSummary('SUM', childRows, 'credits_earned')).toBe(60);
        expect(evaluateMetadataRollupSummary('AVG', childRows, 'credits_earned')).toBe(20);
        expect(evaluateMetadataRollupSummary('MIN', childRows, 'credits_earned')).toBe(16);
        expect(evaluateMetadataRollupSummary('MAX', childRows, 'credits_earned')).toBe(24);
    });

    it('wires Metadata-Driven Custom Object Report Builder, Record Experience 2.0 (Stage Path + Approvals + Timeline), and Flow Builder 2.0', () => {
        const biActions = readWebSource('src/app/(admin)/reports/bi-actions.ts');
        expect(biActions).toContain('export async function getCustomObjectReportCatalog');
        expect(biActions).toContain('export async function runCustomObjectBiReport');

        const customReportUi = readWebSource('src/app/(admin)/reports/custom-object-report-builder.tsx');
        expect(customReportUi).toContain('custom-object-report-builder');
        expect(customReportUi).toContain('run-custom-object-report');

        const recordDetailUi = readWebSource('src/app/(admin)/app/[object]/[id]/record-detail-client.tsx');
        expect(recordDetailUi).toContain('record-stage-path');
        expect(recordDetailUi).toContain('record-approval-bar');
        expect(recordDetailUi).toContain('record-audit-timeline');

        const genericList = readWebSource('src/app/(admin)/app/[object]/generic-list.tsx');
        expect(genericList).toContain('saved-list-views-bar');
        expect(genericList).toContain('pin-list-view-btn');

        const workflowBuilder = readWebSource('src/components/automation/workflow-builder.tsx');
        expect(workflowBuilder).toContain('CREATE_RECORD');
        expect(workflowBuilder).toContain('SUBMIT_FOR_APPROVAL');
    });

    it('supports Track A Dynamic Forms (conditional visibility), Cross-Field Validation Rules, and Auto-Number + Rich Subtypes (EMAIL, PHONE, URL)', () => {
        // 1. Auto-Number format generation
        const autoNumField = normalizeMetadataFieldInput({
            label: 'Inquiry Number',
            apiName: 'inquiry_no',
            dataType: 'AUTO_NUMBER',
            autoNumberPrefix: 'INQ-{YYYY}-{0000}',
        });
        expect(autoNumField.dataType).toBe('TEXT');
        expect(autoNumField.isRequired).toBe(false);
        expect(autoNumField.validationRules.fieldSubType).toBe('AUTO_NUMBER');
        expect(autoNumField.validationRules.autoNumberPrefix).toBe('INQ-{YYYY}-{0000}');

        const formattedId = generateMetadataAutoNumber('INQ-{YYYY}-{0000}', 42);
        expect(formattedId).toMatch(/^INQ-\d{4}-0042$/);

        // 2. Dynamic Forms conditional visibility evaluation
        expect(
            evaluateMetadataVisibilityRule(
                { field: 'stage', operator: 'eq', value: 'DISROLLED' },
                { stage: 'DISROLLED' },
            ),
        ).toBe(true);
        expect(
            evaluateMetadataVisibilityRule(
                { field: 'stage', operator: 'eq', value: 'DISROLLED' },
                { stage: 'ENROLLED' },
            ),
        ).toBe(false);
        expect(
            evaluateMetadataVisibilityRule(
                { field: 'scholarship_percent', operator: 'gt', value: '50' },
                { scholarship_percent: 75 },
            ),
        ).toBe(true);

        // 3. Rich subtypes (EMAIL, PHONE, URL) + Cross-Field Validation Rules
        const fields = [
            {
                apiName: 'contact_email',
                label: 'Contact Email',
                dataType: 'TEXT' as const,
                isRequired: true,
                validationRules: { fieldSubType: 'EMAIL' as const },
            },
            {
                apiName: 'contact_phone',
                label: 'Contact Phone',
                dataType: 'TEXT' as const,
                isRequired: true,
                validationRules: { fieldSubType: 'PHONE' as const },
            },
            {
                apiName: 'portfolio_url',
                label: 'Portfolio URL',
                dataType: 'TEXT' as const,
                isRequired: false,
                validationRules: { fieldSubType: 'URL' as const },
            },
            {
                apiName: 'max_marks',
                label: 'Max Marks',
                dataType: 'NUMBER' as const,
                isRequired: true,
                validationRules: {},
            },
            {
                apiName: 'score_obtained',
                label: 'Score Obtained',
                dataType: 'NUMBER' as const,
                isRequired: true,
                validationRules: {
                    crossFieldTarget: 'max_marks',
                    crossFieldOperator: 'lte' as const,
                    crossFieldErrorMessage: 'Score Obtained cannot exceed Max Marks.',
                },
            },
        ];

        const invalidEmailResult = validateMetadataRecordPayload(fields, {
            contact_email: 'not-an-email',
            contact_phone: '+91 9876543210',
            max_marks: 100,
            score_obtained: 80,
        });
        expect(invalidEmailResult).toEqual({
            ok: false,
            errors: ['Contact Email must be a valid email address.'],
        });

        const crossFieldViolation = validateMetadataRecordPayload(fields, {
            contact_email: 'student@example.edu',
            contact_phone: '+91 9876543210',
            portfolio_url: 'https://portfolio.example.edu',
            max_marks: 100,
            score_obtained: 120,
        });
        expect(crossFieldViolation).toEqual({
            ok: false,
            errors: ['Score Obtained cannot exceed Max Marks.'],
        });

        const validPayload = validateMetadataRecordPayload(fields, {
            contact_email: 'student@example.edu',
            contact_phone: '+91 9876543210',
            portfolio_url: 'https://portfolio.example.edu',
            max_marks: 100,
            score_obtained: 95,
        });
        expect(validPayload).toEqual({
            ok: true,
            data: {
                contact_email: 'student@example.edu',
                contact_phone: '+91 9876543210',
                portfolio_url: 'https://portfolio.example.edu',
                max_marks: '100',
                score_obtained: '95',
            },
        });
    });

    it('supports Track B Education Cloud 360° Record Console (Duplicate & Matching Rules, Clone, Merge, Quick Activities, and SLA Timers)', () => {
        // 1. Duplicate & Matching Rule normalization and evaluation
        const uniqueEmailField = normalizeMetadataFieldInput({
            label: 'Candidate Email',
            apiName: 'candidate_email',
            dataType: 'EMAIL',
            validationRules: { duplicateRuleBehavior: 'BLOCK' },
        });
        expect(uniqueEmailField.validationRules.duplicateRuleBehavior).toBe('BLOCK');

        const dupResult = detectMetadataDuplicates(
            [
                {
                    apiName: 'candidate_email',
                    label: 'Candidate Email',
                    validationRules: { fieldSubType: 'EMAIL', duplicateRuleBehavior: 'BLOCK' },
                },
                {
                    apiName: 'contact_phone',
                    label: 'Contact Phone',
                    validationRules: { fieldSubType: 'PHONE' },
                },
            ],
            {
                candidate_email: 'AARAV@EXAMPLE.EDU',
                contact_phone: '+91 (987) 654-3210',
            },
            [
                {
                    id: '11111111-2222-3333-4444-555555555555',
                    candidate_email: 'aarav@example.edu',
                    contact_phone: '919876543210',
                },
            ],
            { includeContactHeuristics: true },
        );
        expect(dupResult.blocked).toBe(true);
        expect(dupResult.matches).toHaveLength(2);
        expect(dupResult.matches[0]).toMatchObject({
            recordId: '11111111-2222-3333-4444-555555555555',
            fieldApiName: 'candidate_email',
            behavior: 'BLOCK',
        });

        // 2. SLA / Escalation Countdown calculation
        const now = new Date('2026-10-20T12:00:00Z');
        expect(
            computeRecordSlaStatus({
                createdAt: '2026-10-20T06:00:00Z',
                currentStage: 'NEW_INQUIRY',
                slaHours: 24,
                now,
            }).state,
        ).toBe('ON_TRACK');

        expect(
            computeRecordSlaStatus({
                createdAt: '2026-10-19T15:00:00Z',
                currentStage: 'COUNSELED',
                slaHours: 24,
                now,
            }).state,
        ).toBe('AT_RISK');

        expect(
            computeRecordSlaStatus({
                createdAt: '2026-10-18T12:00:00Z',
                currentStage: 'DEMO_ATTENDED',
                slaHours: 24,
                now,
            }).state,
        ).toBe('OVERDUE');

        expect(
            computeRecordSlaStatus({
                createdAt: '2026-10-10T12:00:00Z',
                currentStage: 'ENROLLED',
                slaHours: 24,
                now,
            }).state,
        ).toBe('COMPLETED');

        // 3. Server action & UI wiring checks
        const metadataEngine = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(metadataEngine).toContain('export async function findPotentialDuplicateRecords');
        expect(metadataEngine).toContain('export async function cloneMetadataRecord');
        expect(metadataEngine).toContain('export async function mergeMetadataRecords');
        expect(metadataEngine).toContain('export async function logRecordQuickActivity');

        const recordConsoleUi = readWebSource(
            'src/app/(admin)/app/[object]/[id]/record-detail-client.tsx',
        );
        expect(recordConsoleUi).toContain('record-sla-badge');
        expect(recordConsoleUi).toContain('record-quick-actions-bar');
        expect(recordConsoleUi).toContain('clone-record-btn');
        expect(recordConsoleUi).toContain('record-duplicate-banner');
        expect(recordConsoleUi).toContain('merge-duplicate-btn');
    });

    it('supports Track C Experience Cloud Portals (Web-to-Object Public Intake Forms & Self-Service Status Tracker)', () => {
        const metadataEngine = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(metadataEngine).toContain('export async function savePortalIntakeConfig');
        expect(metadataEngine).toContain('export async function getPublicPortalIntakeSchema');
        expect(metadataEngine).toContain('export async function submitPublicPortalIntakeRecord');
        expect(metadataEngine).toContain('export async function lookupPublicPortalRecordStatus');
        expect(metadataEngine).toContain("'EXPERIENCE_PORTAL_CONFIGURED'");
        expect(metadataEngine).toContain("'EXPERIENCE_PORTAL_SUBMISSION'");

        const portalPublisher = readWebSource(
            'src/app/(admin)/settings/objects/[id]/portal-publisher.tsx',
        );
        expect(portalPublisher).toContain('experience-portal-publisher');
        expect(portalPublisher).toContain('toggle-portal-enabled');
        expect(portalPublisher).toContain('save-portal-config-btn');

        const portalClient = readWebSource(
            'src/app/portal/[tenantId]/[object]/portal-intake-client.tsx',
        );
        expect(portalClient).toContain('portal-intake-form');
        expect(portalClient).toContain('portal-submission-confirmation');
        expect(portalClient).toContain('portal-status-tracker');
        expect(portalClient).toContain('evaluateMetadataVisibilityRule');
    });

    it('enforces Salesforce AppExchange Security Review controls (SSRF callout guard, secret redaction, FLS/RBAC on approvals/clone/merge, and guest portal verifier hardening)', () => {
        // 1. Outbound Webhook Callout SSRF Guard
        expect(isSafeWebhookDestinationUrl('https://hooks.zapier.com/hooks/catch/12345/')).toBe(
            true,
        );
        expect(isSafeWebhookDestinationUrl('http://hooks.zapier.com/hooks/catch/12345/')).toBe(
            false,
        );
        expect(isSafeWebhookDestinationUrl('https://localhost/webhook')).toBe(false);
        expect(isSafeWebhookDestinationUrl('https://127.0.0.1:8080/internal')).toBe(false);
        expect(isSafeWebhookDestinationUrl('https://169.254.169.254/latest/meta-data/')).toBe(
            false,
        );
        expect(isSafeWebhookDestinationUrl('https://10.0.0.12/api')).toBe(false);
        expect(isSafeWebhookDestinationUrl('https://172.16.4.1/api')).toBe(false);
        expect(isSafeWebhookDestinationUrl('https://192.168.1.10/api')).toBe(false);
        expect(isSafeWebhookDestinationUrl('https://metadata.google.internal/computeMetadata')).toBe(
            false,
        );
        expect(isSafeWebhookDestinationUrl('https://service.internal/hook')).toBe(false);

        // 2. Audit Log Secret Redaction
        expect(
            redactSensitiveWorkflowPayload({
                url: 'https://hooks.zapier.com/hooks/catch/12345/',
                method: 'POST',
                secret: 'whsec_live_super_secret',
                apiKey: 'sk_live_999',
            }),
        ).toEqual({
            url: 'https://hooks.zapier.com/hooks/catch/12345/',
            method: 'POST',
            secret: '[REDACTED]',
            apiKey: '[REDACTED]',
        });

        // 3. Server Action RBAC / FLS & Guest Portal Hardening
        const metadataEngine = readWebSource('src/lib/actions/metadata-engine.ts');
        expect(metadataEngine).toContain('isSafeWebhookDestinationUrl(targetUrl)');
        expect(metadataEngine).toContain('redactSensitiveWorkflowPayload(actionPayload)');
        expect(metadataEngine).toContain('allowedApproverRoles');
        expect(metadataEngine).toContain('cleanRef.length >= 8 && idStr.startsWith(cleanRef)');
        expect(metadataEngine).toContain('contactFieldNames');
    });
});


