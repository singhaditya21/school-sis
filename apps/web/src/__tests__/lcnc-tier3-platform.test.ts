/** @jest-environment node */

import fs from 'fs';
import path from 'path';
import {
    assertRlsBypassJustification,
    RLS_BYPASS_JUSTIFICATIONS,
} from '../../../../packages/api/src/db/rls-bypass';
import {
    computeSchemaBundleSha256,
    validateScholarMindSchemaBundle,
    type ScholarMindSchemaBundle,
} from '@/lib/metadata/platform';

function readWebSource(relPath: string): string {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('Salesforce Platform Tier-3 — Agentforce LCNC Spine, Web-to-Object v2 & AppExchange Packaging', () => {
    describe('1. Branded RLS Bypass Justification for Friendly Portal Tenant Slugs', () => {
        it('registers PUBLIC_PORTAL_TENANT_LOOKUP with valid brand and >= 30 char reason', () => {
            const justification = RLS_BYPASS_JUSTIFICATIONS.PUBLIC_PORTAL_TENANT_LOOKUP;
            expect(justification).toBeDefined();
            expect(justification.id).toBe('portal.public-tenant-lookup');
            expect(justification.reason.length).toBeGreaterThanOrEqual(30);
            expect(() => assertRlsBypassJustification(justification)).not.toThrow();
        });
    });

    describe('2. Portable Schema Bundle v2 Governance Packaging & SHA-256 Provenance', () => {
        const sampleGovernanceBundle = {
            formatVersion: 'scholarmind.bundle.v1',
            bundleName: 'K-12 Scholarship Governance Pack',
            bundleDescription: 'Full OWD, Sharing, Validation, Multi-Step Approval & Views bundle',
            exportedAt: '2026-11-13T10:00:00.000Z',
            objects: [
                {
                    name: 'Scholarship Grant',
                    apiName: 'scholarship_grant',
                    description: 'Merit & need-based financial aid applications',
                    fields: [
                        {
                            label: 'Applicant Name',
                            apiName: 'applicant_name',
                            dataType: 'TEXT',
                            isRequired: true,
                        },
                        {
                            label: 'Grant Amount',
                            apiName: 'grant_amount',
                            dataType: 'CURRENCY',
                            isRequired: true,
                            validationRules: { min: 0 },
                        },
                        {
                            label: 'Stage',
                            apiName: 'stage',
                            dataType: 'PICKLIST',
                            isRequired: true,
                            picklistOptions: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
                        },
                    ],
                    layouts: [
                        {
                            layoutType: 'FORM',
                            name: 'Counselor Intake Form',
                            assignedRoles: ['COUNSELOR', 'ADMISSIONS_HEAD'],
                            schema: { sections: [{ title: 'Grant Details', fields: ['applicant_name', 'grant_amount', 'stage'] }] },
                        },
                        {
                            layoutType: 'HOME',
                            name: 'Scholarship Home KPI Strip',
                            schema: { welcomeHeadline: 'Scholarship Operations Hub' },
                        },
                    ],
                    owdMode: 'PRIVATE',
                    sharingRules: [
                        {
                            name: 'Share High-Value Grants with Finance',
                            criteriaField: 'grant_amount',
                            criteriaOperator: 'gte',
                            criteriaValue: '50000',
                            sharedWithRole: 'FINANCE_MANAGER',
                            accessLevel: 'READ_WRITE',
                        },
                    ],
                    validationRules: [
                        {
                            name: 'Cap_Grant_Amount',
                            description: 'Prevent unapproved grants above 250k without override',
                            errorConditionFormula: 'grant_amount > 250000',
                            errorMessage: 'Grant amount cannot exceed INR 2,50,000 on standard intake.',
                            errorField: 'grant_amount',
                        },
                    ],
                    approvalProcesses: [
                        {
                            name: 'Two_Step_Scholarship_Committee',
                            entryCriteriaFormula: 'grant_amount >= 25000',
                            lockRecordOnSubmit: true,
                            steps: [
                                {
                                    stepNumber: 1,
                                    stepName: 'Dean Review',
                                    approverRole: 'DEAN',
                                },
                                {
                                    stepNumber: 2,
                                    stepName: 'Principal Sign-Off',
                                    approverRole: 'PRINCIPAL',
                                },
                            ],
                            fieldUpdatesOnApprove: { stage: 'APPROVED' },
                            fieldUpdatesOnReject: { stage: 'REJECTED' },
                        },
                    ],
                    savedViews: [
                        {
                            name: 'High Priority Board Queue',
                            viewMode: 'KANBAN',
                            columns: ['applicant_name', 'grant_amount', 'stage'],
                            filters: [{ field: 'stage', operator: 'equals', value: 'SUBMITTED' }],
                            visibility: 'ROLES',
                            allowedRoles: ['PRINCIPAL', 'DEAN'],
                            isDefault: true,
                        },
                    ],
                },
            ],
            workflows: [
                {
                    name: 'Notify Scholarship Desk',
                    objectName: 'scholarship_grant',
                    triggerEvent: 'object.record.upserted',
                    conditions: [{ field: 'applicant_name', operator: 'not_empty', value: '' }],
                    actionType: 'CREATE_TASK',
                    actionPayload: { title: 'Verify supporting income documents', apiKey: 'secret-xyz' },
                },
            ],
        };

        it('validates and normalizes Tier-1 & Tier-2 governance structures inside scholarmind.bundle.v1', () => {
            const res = validateScholarMindSchemaBundle(sampleGovernanceBundle);
            expect(res.ok).toBe(true);
            if (res.ok === false) return;

            const obj = res.bundle.objects[0];
            expect(obj.owdMode).toBe('PRIVATE');
            expect(obj.layouts).toHaveLength(2);
            expect(obj.layouts[0].name).toBe('Counselor Intake Form');
            expect(obj.layouts[0].assignedRoles).toEqual(['COUNSELOR', 'ADMISSIONS_HEAD']);
            expect(obj.layouts[1].layoutType).toBe('HOME');

            expect(obj.sharingRules).toHaveLength(1);
            expect(obj.sharingRules?.[0].accessLevel).toBe('READ_WRITE');

            expect(obj.validationRules).toHaveLength(1);
            expect(obj.validationRules?.[0].errorConditionFormula).toBe('grant_amount > 250000');

            expect(obj.approvalProcesses).toHaveLength(1);
            expect(obj.approvalProcesses?.[0].steps).toHaveLength(2);
            expect(obj.approvalProcesses?.[0].fieldUpdatesOnApprove).toEqual({ stage: 'APPROVED' });

            expect(obj.savedViews).toHaveLength(1);
            expect(obj.savedViews?.[0].viewMode).toBe('KANBAN');

            // Sensitive workflow keys must still be redacted
            expect(res.bundle.workflows[0].actionPayload.apiKey).toBe('[REDACTED]');
        });

        it('computes deterministic SHA-256 package provenance invariant to exportedAt timestamp', () => {
            const resA = validateScholarMindSchemaBundle(sampleGovernanceBundle);
            const resB = validateScholarMindSchemaBundle({
                ...sampleGovernanceBundle,
                exportedAt: '2027-05-01T00:00:00.000Z',
            });
            expect(resA.ok).toBe(true);
            expect(resB.ok).toBe(true);
            if (resA.ok === false || resB.ok === false) return;

            const hashA = computeSchemaBundleSha256(resA.bundle as ScholarMindSchemaBundle);
            const hashB = computeSchemaBundleSha256(resB.bundle as ScholarMindSchemaBundle);
            expect(hashA).toMatch(/^[a-f0-9]{64}$/);
            expect(hashA).toBe(hashB);
        });
    });

    describe('3. Agentforce LCNC Spine, Web-to-Object v2 & Live AppExchange Wiring', () => {
        it('registers LCNC read and human-reviewed mutation tools in the governed AI spine', () => {
            const readsSource = readWebSource('src/lib/ai/tools/reads.ts');
            const mutationsSource = readWebSource('src/lib/ai/tools/mutations.ts');

            expect(readsSource).toContain("name: 'metadata.object_catalog'");
            expect(readsSource).toContain("name: 'metadata.pending_approvals'");
            expect(readsSource).toContain("name: 'metadata.active_automations'");
            expect(readsSource).toContain("name: 'metadata.installed_packages'");
            expect(mutationsSource).toContain("name: 'metadata.request_record_review'");
            expect(mutationsSource).toContain("approvalPolicyId: 'agents.approval.review'");
        });

        it('wires friendly tenant slug lookup, honeypot bot guard, formula validation, and approval auto-entry on Web-to-Object intake', () => {
            const engineSource = readWebSource('src/lib/actions/metadata-engine.ts');
            expect(engineSource).toContain('resolvePublicPortalTenantId');
            expect(engineSource).toContain('RLS_BYPASS_JUSTIFICATIONS.PUBLIC_PORTAL_TENANT_LOOKUP');
            expect(engineSource).toContain('_hp_website');
            expect(engineSource).toContain('enforceObjectValidationRulesInternal');
            expect(engineSource).toContain('autoSubmitForApproval');
            expect(engineSource).toContain('metadata_installed_packages');
        });

        it('renders Live AppExchange Registry, Dry-Run Bundle Diff Previewer, and Object Home Copilot', () => {
            const appExchangeSource = readWebSource('src/app/(dashboard)/appexchange/page.tsx');
            const copilotSource = readWebSource('src/app/(admin)/app/[object]/object-copilot-bar.tsx');
            const studioSource = readWebSource('src/app/(admin)/settings/objects/schema-package-studio.tsx');

            expect(appExchangeSource).toContain('listInstalledMetadataPackagesAction');
            expect(appExchangeSource).toContain('BlueprintInstaller');
            expect(appExchangeSource).toContain('SchemaPackageStudio');
            expect(copilotSource).toContain('askObjectCopilotAction');
            expect(copilotSource).toContain('proposeObjectCopilotApprovalAction');
            expect(studioSource).toContain('previewSchemaBundleImportAction');
        });
    });
});
