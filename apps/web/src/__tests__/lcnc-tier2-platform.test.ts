import fs from 'fs';
import path from 'path';
import {
    canAccessRecordUnderOwd,
    computeReadableRecordFieldDiffs,
    evaluateApprovalStepDecision,
    evaluateRecordValidationRules,
    evaluateValidationRuleFormula,
    joinRecordsOnLookup,
    resolveRecordOwnerUserId,
    selectMatchingApprovalProcess,
    type MetadataApprovalInstanceItem,
    type MetadataApprovalProcessItem,
    type MetadataSharingRuleItem,
    type MetadataValidationRuleItem,
} from '@/lib/metadata/lcnc-helpers';

describe('Salesforce Platform Tier-2 Architecture (OWD, Validation Rules, Multi-Step Approvals, Joined Reports & Timeline Diffs)', () => {
    describe('1. Organization-Wide Defaults (OWD) & Criteria Sharing Rules', () => {
        const sampleRules: MetadataSharingRuleItem[] = [
            {
                id: 'sr-1',
                objectApiName: 'discipline_incident',
                name: 'Hostel Warden Wing A Read/Write',
                criteriaField: 'wing',
                criteriaOperator: 'eq',
                criteriaValue: 'Wing A',
                sharedWithRole: 'HOSTEL_WARDEN_CUSTOM',
                accessLevel: 'READ_WRITE',
                isActive: true,
                createdAt: '2026-11-13T00:00:00Z',
            },
            {
                id: 'sr-2',
                objectApiName: 'discipline_incident',
                name: 'Counselor Severity Read-Only',
                criteriaField: 'severity_score',
                criteriaOperator: 'gt',
                criteriaValue: '5',
                sharedWithRole: 'COUNSELOR',
                accessLevel: 'READ',
                isActive: true,
                createdAt: '2026-11-13T00:00:00Z',
            },
        ];

        it('resolves record owner across EAV owner_user_id and TABLE _owner_user_id / created_by', () => {
            expect(resolveRecordOwnerUserId({ owner_user_id: 'user-1' })).toBe('user-1');
            expect(resolveRecordOwnerUserId({ _owner_user_id: 'user-2' })).toBe('user-2');
            expect(resolveRecordOwnerUserId({ created_by: 'user-3' })).toBe('user-3');
            expect(resolveRecordOwnerUserId({ title: 'No owner' })).toBeNull();
        });

        it('enforces PRIVATE OWD for non-owners while granting owner, admin, and matching criteria sharing access', () => {
            const record = {
                id: 'rec-1',
                owner_user_id: 'owner-uuid',
                wing: 'Wing A',
                severity_score: 8,
            };

            // Unrelated teacher blocked under PRIVATE
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'READ',
                    record,
                    callerUserId: 'other-teacher',
                    effectiveRoleCode: 'TEACHER',
                    baseRole: 'TEACHER',
                    sharingRules: sampleRules,
                }),
            ).toBe(false);

            // Owner has READ and WRITE under PRIVATE
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'WRITE',
                    record,
                    callerUserId: 'owner-uuid',
                    effectiveRoleCode: 'TEACHER',
                    baseRole: 'TEACHER',
                    sharingRules: sampleRules,
                }),
            ).toBe(true);

            // Custom Role granted READ_WRITE via criteria rule (wing == 'Wing A')
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'WRITE',
                    record,
                    callerUserId: 'warden-user',
                    effectiveRoleCode: 'HOSTEL_WARDEN_CUSTOM',
                    baseRole: 'STAFF',
                    sharingRules: sampleRules,
                }),
            ).toBe(true);

            // Counselor granted READ (severity_score > 5) but NOT WRITE
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'READ',
                    record,
                    callerUserId: 'counselor-user',
                    effectiveRoleCode: 'COUNSELOR',
                    baseRole: 'COUNSELOR',
                    sharingRules: sampleRules,
                }),
            ).toBe(true);
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'WRITE',
                    record,
                    callerUserId: 'counselor-user',
                    effectiveRoleCode: 'COUNSELOR',
                    baseRole: 'COUNSELOR',
                    sharingRules: sampleRules,
                }),
            ).toBe(false);

            // Tenant SCHOOL_ADMIN always bypasses OWD restrictions
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PRIVATE',
                    operation: 'WRITE',
                    record,
                    callerUserId: 'admin-user',
                    effectiveRoleCode: 'SCHOOL_ADMIN',
                    baseRole: 'SCHOOL_ADMIN',
                    sharingRules: [],
                }),
            ).toBe(true);
        });

        it('allows universal READ under PUBLIC_READ_ONLY while restricting WRITE to owner or READ_WRITE sharing rule', () => {
            const record = { id: 'rec-2', owner_user_id: 'owner-1', wing: 'Wing B' };
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PUBLIC_READ_ONLY',
                    operation: 'READ',
                    record,
                    callerUserId: 'teacher-2',
                    effectiveRoleCode: 'TEACHER',
                    baseRole: 'TEACHER',
                    sharingRules: sampleRules,
                }),
            ).toBe(true);
            expect(
                canAccessRecordUnderOwd({
                    owdMode: 'PUBLIC_READ_ONLY',
                    operation: 'WRITE',
                    record,
                    callerUserId: 'teacher-2',
                    effectiveRoleCode: 'TEACHER',
                    baseRole: 'TEACHER',
                    sharingRules: sampleRules,
                }),
            ).toBe(false);
        });
    });

    describe('2. Cross-Field Boolean Formula Validation Rules Engine', () => {
        const rules: MetadataValidationRuleItem[] = [
            {
                id: 'vr-1',
                objectApiName: 'concession',
                name: 'High_Concession_Requires_Justification',
                description: null,
                errorConditionFormula: 'concession_pct > 25 && ISBLANK(justification)',
                errorMessage: 'Concessions above 25% require written justification.',
                errorField: 'justification',
                isActive: true,
                createdAt: '2026-11-13T00:00:00Z',
            },
            {
                id: 'vr-2',
                objectApiName: 'concession',
                name: 'Max_Cap_100',
                description: null,
                errorConditionFormula: 'OR(concession_pct < 0, concession_pct > 100)',
                errorMessage: 'Concession percentage must be between 0 and 100.',
                errorField: 'concession_pct',
                isActive: true,
                createdAt: '2026-11-13T00:00:00Z',
            },
            {
                id: 'vr-inactive',
                objectApiName: 'concession',
                name: 'Paused_Rule',
                description: null,
                errorConditionFormula: 'TRUE',
                errorMessage: 'Should not fire when paused.',
                errorField: null,
                isActive: false,
                createdAt: '2026-11-13T00:00:00Z',
            },
        ];

        it('evaluates Salesforce-style boolean, blank, string, and arithmetic formulas without eval()', () => {
            expect(
                evaluateValidationRuleFormula('concession_pct > 25 && ISBLANK(justification)', {
                    concession_pct: 40,
                    justification: '   ',
                }),
            ).toBe(true);

            expect(
                evaluateValidationRuleFormula('concession_pct > 25 && ISBLANK(justification)', {
                    concession_pct: 40,
                    justification: 'Merit scholar topper',
                }),
            ).toBe(false);

            expect(
                evaluateValidationRuleFormula(
                    'AND(CONTAINS(category, "SPORTS"), LEN(remarks) < 5)',
                    { category: 'National Sports Quota', remarks: 'ok' },
                ),
            ).toBe(true);

            expect(
                evaluateValidationRuleFormula('(tuition_fee - discount_amount) < 0', {
                    tuition_fee: 10000,
                    discount_amount: 12500,
                }),
            ).toBe(true);
        });

        it('collects active rule violations and ignores paused validation rules', () => {
            const invalid = evaluateRecordValidationRules(rules, {
                concession_pct: 50,
                justification: '',
            });
            expect(invalid.valid).toBe(false);
            expect(invalid.violations).toHaveLength(1);
            expect(invalid.violations[0].errorField).toBe('justification');

            const valid = evaluateRecordValidationRules(rules, {
                concession_pct: 50,
                justification: 'Approved by Trust Board',
            });
            expect(valid.valid).toBe(true);
            expect(valid.violations).toHaveLength(0);
        });
    });

    describe('3. Declarative Multi-Step Approval Processes & Maker-Checker', () => {
        const twoStepProcess: MetadataApprovalProcessItem = {
            id: 'proc-high-val',
            objectApiName: 'scholarship_grant',
            name: 'High Value Grant 2-Step Approval',
            description: null,
            entryCriteriaFormula: 'grant_amount >= 25000',
            steps: [
                { stepNumber: 1, stepName: 'Finance Verification', approverRole: 'FINANCE_LEAD' },
                { stepNumber: 2, stepName: 'Principal Final Approval', approverRole: 'PRINCIPAL' },
            ],
            lockRecordOnSubmit: true,
            fieldUpdatesOnApprove: { approval_status: 'APPROVED', disbursement_ready: 'true' },
            fieldUpdatesOnReject: { approval_status: 'REJECTED' },
            isActive: true,
            createdAt: '2026-11-13T00:00:00Z',
        };

        const standardProcess: MetadataApprovalProcessItem = {
            ...twoStepProcess,
            id: 'proc-default',
            name: 'Standard 1-Step Approval',
            entryCriteriaFormula: null,
            steps: [{ stepNumber: 1, stepName: 'HOD Sign-off', approverRole: 'HOD' }],
        };

        it('selects conditional entry-criteria process over unconditional fallback', () => {
            const highMatch = selectMatchingApprovalProcess(
                [standardProcess, twoStepProcess],
                { grant_amount: 40000 },
            );
            expect(highMatch?.id).toBe('proc-high-val');

            const lowMatch = selectMatchingApprovalProcess(
                [standardProcess, twoStepProcess],
                { grant_amount: 5000 },
            );
            expect(lowMatch?.id).toBe('proc-default');
        });

        it('enforces maker-checker, role gates, step progression, record locking, and terminal field updates', () => {
            const baseInstance: MetadataApprovalInstanceItem = {
                id: 'inst-1',
                processId: twoStepProcess.id,
                processName: twoStepProcess.name,
                objectApiName: 'scholarship_grant',
                recordId: 'rec-100',
                status: 'PENDING',
                currentStep: 1,
                totalSteps: 2,
                currentStepName: 'Finance Verification',
                currentApproverRole: 'FINANCE_LEAD',
                submittedBy: 'counselor-1',
                submissionComment: 'Please review merit scholarship',
                stepHistory: [],
                isLocked: true,
                createdAt: '2026-11-13T00:00:00Z',
                updatedAt: '2026-11-13T00:00:00Z',
            };

            // 1. Submitter cannot self-approve (4-eyes maker-checker)
            const selfApprove = evaluateApprovalStepDecision({
                process: twoStepProcess,
                instance: baseInstance,
                actorUserId: 'counselor-1',
                effectiveRoleCode: 'FINANCE_LEAD',
                baseRole: 'FINANCE_LEAD',
                decision: 'APPROVED',
            });
            expect(selfApprove.ok).toBe(false);

            // 2. Wrong role cannot approve Step 1
            const wrongRole = evaluateApprovalStepDecision({
                process: twoStepProcess,
                instance: baseInstance,
                actorUserId: 'teacher-9',
                effectiveRoleCode: 'TEACHER',
                baseRole: 'TEACHER',
                decision: 'APPROVED',
            });
            expect(wrongRole.ok).toBe(false);

            // 3. Finance Lead approves Step 1 -> advances to Step 2, stays PENDING & LOCKED
            const step1Res = evaluateApprovalStepDecision({
                process: twoStepProcess,
                instance: baseInstance,
                actorUserId: 'finance-user-1',
                effectiveRoleCode: 'FINANCE_LEAD',
                baseRole: 'FINANCE_LEAD',
                decision: 'APPROVED',
                comment: 'Budget verified',
            });
            expect(step1Res.ok).toBe(true);
            if (!step1Res.ok) return;
            expect(step1Res.nextStatus).toBe('PENDING');
            expect(step1Res.nextStep).toBe(2);
            expect(step1Res.nextIsLocked).toBe(true);
            expect(step1Res.fieldUpdatesToApply).toEqual({});

            // 4. Principal approves Step 2 -> terminal APPROVED, unlocks record, emits fieldUpdatesOnApprove
            const step2Res = evaluateApprovalStepDecision({
                process: twoStepProcess,
                instance: {
                    ...baseInstance,
                    currentStep: step1Res.nextStep,
                    stepHistory: step1Res.updatedHistory,
                },
                actorUserId: 'principal-user-1',
                effectiveRoleCode: 'PRINCIPAL',
                baseRole: 'PRINCIPAL',
                decision: 'APPROVED',
                comment: 'Granted',
            });
            expect(step2Res.ok).toBe(true);
            if (!step2Res.ok) return;
            expect(step2Res.nextStatus).toBe('APPROVED');
            expect(step2Res.nextIsLocked).toBe(false);
            expect(step2Res.updatedHistory).toHaveLength(2);
            expect(step2Res.fieldUpdatesToApply).toEqual({
                approval_status: 'APPROVED',
                disbursement_ready: 'true',
            });
        });
    });

    describe('4. FLS-Filtered Field-Level Audit Diffs & Cross-Object Lookup Joins', () => {
        it('computes before -> after diffs strictly for FLS-readable fields', () => {
            const diffs = computeReadableRecordFieldDiffs(
                { status: 'DRAFT', grant_amount: 10000, internal_secret: 'old' },
                { status: 'APPROVED', grant_amount: 15000, internal_secret: 'new' },
                [
                    { apiName: 'status', label: 'Status' },
                    { apiName: 'grant_amount', label: 'Grant Amount' },
                ],
            );
            expect(diffs).toEqual([
                { field: 'status', label: 'Status', before: 'DRAFT', after: 'APPROVED' },
                { field: 'grant_amount', label: 'Grant Amount', before: '10000', after: '15000' },
            ]);
        });

        it('joins Child -> Parent and Parent -> Child records across LEFT and INNER lookup joins', () => {
            const allocations = [
                { id: 'a1', student_id: 's1', fee: 2000 },
                { id: 'a2', student_id: 's-missing', fee: 1800 },
            ];
            const students = [{ id: 's1', grade_name: 'Grade 10', house: 'Tagore' }];

            const innerJoined = joinRecordsOnLookup({
                primaryRows: allocations,
                relatedRows: students,
                joinConfig: {
                    relatedObjectApiName: 'student',
                    lookupFieldApiName: 'student_id',
                    joinDirection: 'CHILD_TO_PARENT',
                    joinType: 'INNER',
                    relatedColumns: ['grade_name', 'house'],
                },
            });
            expect(innerJoined).toHaveLength(1);
            expect(innerJoined[0]['student.grade_name']).toBe('Grade 10');

            const leftJoined = joinRecordsOnLookup({
                primaryRows: allocations,
                relatedRows: students,
                joinConfig: {
                    relatedObjectApiName: 'student',
                    lookupFieldApiName: 'student_id',
                    joinDirection: 'CHILD_TO_PARENT',
                    joinType: 'LEFT',
                    relatedColumns: ['grade_name'],
                },
            });
            expect(leftJoined).toHaveLength(2);
            expect(leftJoined[1]['student.grade_name']).toBeNull();
        });

        it('ships expand-only migration 0019 and Tier-2 Governance, Dashboard & Attachment studios', () => {
            const migrationSql = fs.readFileSync(
                path.join(process.cwd(), 'drizzle/0019_add_lcnc_tier2_tables.sql'),
                'utf8',
            );
            for (const table of [
                'metadata_sharing_rules',
                'metadata_validation_rules',
                'metadata_approval_processes',
                'metadata_approval_instances',
                'metadata_dashboards',
                'metadata_record_attachments',
            ]) {
                expect(migrationSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
            }
            expect(
                fs.existsSync(
                    path.join(
                        process.cwd(),
                        'src/app/(admin)/settings/objects/[id]/object-governance-studio.tsx',
                    ),
                ),
            ).toBe(true);
            expect(
                fs.existsSync(
                    path.join(
                        process.cwd(),
                        'src/app/(admin)/reports/custom-dashboard-studio.tsx',
                    ),
                ),
            ).toBe(true);
        });
    });
});
