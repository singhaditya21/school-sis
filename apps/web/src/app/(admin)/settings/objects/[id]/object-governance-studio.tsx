'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    CheckCircle2,
    FlaskConical,
    GitPullRequest,
    Lock,
    Plus,
    Shield,
    ShieldAlert,
    Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { MetadataField } from '@/lib/actions/metadata-engine';
import {
    evaluateValidationRuleFormula,
    type ApprovalProcessStepDef,
    type MetadataApprovalProcessItem,
    type MetadataSharingRuleItem,
    type MetadataValidationRuleItem,
    type OwdMode,
    type SharingCriteriaOperator,
} from '@/lib/metadata/lcnc-helpers';
import {
    deleteMetadataApprovalProcessAction,
    deleteMetadataSharingRuleAction,
    deleteMetadataValidationRuleAction,
    saveMetadataApprovalProcessAction,
    saveMetadataSharingRuleAction,
    saveMetadataValidationRuleAction,
    toggleMetadataValidationRuleAction,
    updateObjectOwdModeAction,
} from '@/lib/actions/lcnc-tier2';

const BUILT_IN_ROLES = [
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'VICE_PRINCIPAL',
    'HOD',
    'TEACHER',
    'CLASS_TEACHER',
    'ADMISSIONS_COUNSELOR',
    'FINANCE_LEAD',
    'ACCOUNTANT',
    'HR_MANAGER',
    'LIBRARIAN',
    'TRANSPORT_MANAGER',
    'HOSTEL_WARDEN',
    'NURSE',
    'RECEPTIONIST',
];

const FORMULA_HELPERS = [
    { label: 'ISBLANK(field)', snippet: 'ISBLANK()' },
    { label: 'NOT_BLANK(field)', snippet: 'NOT_BLANK()' },
    { label: 'AND(a, b)', snippet: 'AND(, )' },
    { label: 'OR(a, b)', snippet: 'OR(, )' },
    { label: 'CONTAINS(f, "x")', snippet: 'CONTAINS(, "")' },
    { label: 'LEN(field) < 5', snippet: 'LEN() < 5' },
];

export default function ObjectGovernanceStudioClient({
    objectName,
    objectApiName,
    fields,
    customRoles = [],
    initialOwdMode,
    initialSharingRules,
    initialValidationRules,
    initialApprovalProcesses,
}: {
    objectName: string;
    objectApiName: string;
    fields: MetadataField[];
    customRoles?: { code: string; name: string }[];
    initialOwdMode: OwdMode;
    initialSharingRules: MetadataSharingRuleItem[];
    initialValidationRules: MetadataValidationRuleItem[];
    initialApprovalProcesses: MetadataApprovalProcessItem[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<'OWD' | 'VALIDATION' | 'APPROVALS'>('OWD');

    // 1. OWD & Sharing Rules state
    const [owdMode, setOwdMode] = useState<OwdMode>(initialOwdMode);
    const [sharingRules, setSharingRules] =
        useState<MetadataSharingRuleItem[]>(initialSharingRules);
    const [shareName, setShareName] = useState('');
    const [shareField, setShareField] = useState('__all__');
    const [shareOp, setShareOp] = useState<SharingCriteriaOperator>('eq');
    const [shareVal, setShareVal] = useState('');
    const [shareRole, setShareRole] = useState('TEACHER');
    const [shareAccess, setShareAccess] = useState<'READ' | 'READ_WRITE'>('READ');

    // 2. Validation Rules state
    const [validationRules, setValidationRules] =
        useState<MetadataValidationRuleItem[]>(initialValidationRules);
    const [valName, setValName] = useState('');
    const [valFormula, setValFormula] = useState('');
    const [valMessage, setValMessage] = useState('');
    const [valErrorField, setValErrorField] = useState('__banner__');
    const [sampleFieldKey, setSampleFieldKey] = useState(fields[0]?.apiName || '');
    const [sampleFieldVal, setSampleFieldVal] = useState('');
    const [sampleRecord, setSampleRecord] = useState<Record<string, unknown>>({});

    // 3. Multi-Step Approval Processes state
    const [approvalProcesses, setApprovalProcesses] =
        useState<MetadataApprovalProcessItem[]>(initialApprovalProcesses);
    const [procName, setProcName] = useState('');
    const [procEntryFormula, setProcEntryFormula] = useState('');
    const [procLockOnSubmit, setProcLockOnSubmit] = useState(true);
    const [procSteps, setProcSteps] = useState<ApprovalProcessStepDef[]>([
        { stepNumber: 1, stepName: 'Department Review', approverRole: 'HOD' },
        { stepNumber: 2, stepName: 'Principal Final Sign-Off', approverRole: 'PRINCIPAL' },
    ]);
    const [approveUpdateField, setApproveUpdateField] = useState('__none__');
    const [approveUpdateValue, setApproveUpdateValue] = useState('APPROVED');
    const [rejectUpdateField, setRejectUpdateField] = useState('__none__');
    const [rejectUpdateValue, setRejectUpdateValue] = useState('REJECTED');

    const roleOptions = [
        ...BUILT_IN_ROLES.map(code => ({ code, label: `${code} (System)` })),
        ...customRoles.map(r => ({ code: r.code, label: `${r.name} (${r.code})` })),
    ];

    const handleSaveOwd = () => {
        startTransition(async () => {
            const res = await updateObjectOwdModeAction({
                objectApiName,
                owdMode,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save OWD setting');
                return;
            }
            toast.success(`Organization-Wide Default updated to ${owdMode}`);
            router.refresh();
        });
    };

    const handleAddSharingRule = () => {
        if (!shareName.trim()) {
            toast.error('Enter a sharing rule name.');
            return;
        }
        startTransition(async () => {
            const criteriaField = shareField === '__all__' ? null : shareField;
            const res = await saveMetadataSharingRuleAction({
                objectApiName,
                name: shareName.trim(),
                criteriaField,
                criteriaOperator: shareOp,
                criteriaValue: criteriaField ? shareVal : null,
                sharedWithRole: shareRole,
                accessLevel: shareAccess,
                isActive: true,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save sharing rule');
                return;
            }
            const nextRule: MetadataSharingRuleItem = {
                id: res.id || `sr-${Date.now()}`,
                objectApiName,
                name: shareName.trim(),
                criteriaField,
                criteriaOperator: shareOp,
                criteriaValue: criteriaField ? shareVal : null,
                sharedWithRole: shareRole,
                accessLevel: shareAccess,
                isActive: true,
                createdAt: new Date().toISOString(),
            };
            setSharingRules(prev => [...prev, nextRule]);
            setShareName('');
            setShareVal('');
            toast.success('Sharing rule created');
            router.refresh();
        });
    };

    const handleDeleteSharingRule = (id: string) => {
        startTransition(async () => {
            const res = await deleteMetadataSharingRuleAction(id);
            if (!res.success) {
                toast.error(res.error || 'Failed to delete sharing rule');
                return;
            }
            setSharingRules(prev => prev.filter(r => r.id !== id));
            toast.success('Sharing rule removed');
            router.refresh();
        });
    };

    const handleSaveValidationRule = () => {
        if (!valName.trim() || !valFormula.trim() || !valMessage.trim()) {
            toast.error('Rule name, error condition formula, and error message are required.');
            return;
        }
        startTransition(async () => {
            const errorField = valErrorField === '__banner__' ? null : valErrorField;
            const res = await saveMetadataValidationRuleAction({
                objectApiName,
                name: valName.trim(),
                errorConditionFormula: valFormula.trim(),
                errorMessage: valMessage.trim(),
                errorField,
                isActive: true,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save validation rule');
                return;
            }
            const nextRule: MetadataValidationRuleItem = {
                id: res.id || `vr-${Date.now()}`,
                objectApiName,
                name: valName.trim(),
                description: null,
                errorConditionFormula: valFormula.trim(),
                errorMessage: valMessage.trim(),
                errorField,
                isActive: true,
                createdAt: new Date().toISOString(),
            };
            setValidationRules(prev => [...prev, nextRule]);
            setValName('');
            setValFormula('');
            setValMessage('');
            toast.success('Validation rule saved and active');
            router.refresh();
        });
    };

    const handleToggleValidationRule = (rule: MetadataValidationRuleItem) => {
        startTransition(async () => {
            const nextActive = !rule.isActive;
            const res = await toggleMetadataValidationRuleAction(rule.id, nextActive);
            if (!res.success) {
                toast.error(res.error || 'Failed to toggle validation rule');
                return;
            }
            setValidationRules(prev =>
                prev.map(r => (r.id === rule.id ? { ...r, isActive: nextActive } : r)),
            );
            toast.success(`Rule "${rule.name}" ${nextActive ? 'enabled' : 'paused'}`);
            router.refresh();
        });
    };

    const handleDeleteValidationRule = (id: string) => {
        startTransition(async () => {
            const res = await deleteMetadataValidationRuleAction(id);
            if (!res.success) {
                toast.error(res.error || 'Failed to delete validation rule');
                return;
            }
            setValidationRules(prev => prev.filter(r => r.id !== id));
            toast.success('Validation rule deleted');
            router.refresh();
        });
    };

    const handleSaveApprovalProcess = () => {
        if (!procName.trim()) {
            toast.error('Enter an approval process name.');
            return;
        }
        if (procSteps.length === 0) {
            toast.error('Add at least one approval step.');
            return;
        }
        startTransition(async () => {
            const fieldUpdatesOnApprove: Record<string, string> = {};
            if (approveUpdateField !== '__none__' && approveUpdateValue.trim()) {
                fieldUpdatesOnApprove[approveUpdateField] = approveUpdateValue.trim();
            }
            const fieldUpdatesOnReject: Record<string, string> = {};
            if (rejectUpdateField !== '__none__' && rejectUpdateValue.trim()) {
                fieldUpdatesOnReject[rejectUpdateField] = rejectUpdateValue.trim();
            }

            const normalizedSteps = procSteps.map((s, idx) => ({
                stepNumber: idx + 1,
                stepName: s.stepName.trim() || `Step ${idx + 1}`,
                approverRole: s.approverRole,
            }));

            const res = await saveMetadataApprovalProcessAction({
                objectApiName,
                name: procName.trim(),
                entryCriteriaFormula: procEntryFormula.trim() || null,
                steps: normalizedSteps,
                lockRecordOnSubmit: procLockOnSubmit,
                fieldUpdatesOnApprove,
                fieldUpdatesOnReject,
                isActive: true,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save approval process');
                return;
            }
            const nextProc: MetadataApprovalProcessItem = {
                id: res.id || `ap-${Date.now()}`,
                objectApiName,
                name: procName.trim(),
                description: null,
                entryCriteriaFormula: procEntryFormula.trim() || null,
                steps: normalizedSteps,
                lockRecordOnSubmit: procLockOnSubmit,
                fieldUpdatesOnApprove,
                fieldUpdatesOnReject,
                isActive: true,
                createdAt: new Date().toISOString(),
            };
            setApprovalProcesses(prev => [...prev, nextProc]);
            setProcName('');
            setProcEntryFormula('');
            toast.success('Multi-step approval process published');
            router.refresh();
        });
    };

    const handleDeleteApprovalProcess = (id: string) => {
        startTransition(async () => {
            const res = await deleteMetadataApprovalProcessAction(id);
            if (!res.success) {
                toast.error(res.error || 'Failed to delete approval process');
                return;
            }
            setApprovalProcesses(prev => prev.filter(p => p.id !== id));
            toast.success('Approval process deleted');
            router.refresh();
        });
    };

    const liveFormulaTriggered = valFormula.trim()
        ? evaluateValidationRuleFormula(valFormula, sampleRecord)
        : false;

    return (
        <Card className="border-border shadow-sm" data-testid="object-governance-studio">
            <CardHeader className="border-b border-border pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Shield className="w-5 h-5 text-primary" />
                            Enterprise Record Governance Studio ({objectName})
                        </CardTitle>
                        <CardDescription>
                            Configure Organization-Wide Defaults (OWD) &amp; Sharing Rules,
                            Cross-Field Formula Validation Rules, and Multi-Step Approval Processes.
                        </CardDescription>
                    </div>
                    <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('OWD')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                activeTab === 'OWD'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            OWD &amp; Sharing ({sharingRules.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('VALIDATION')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                activeTab === 'VALIDATION'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Validation Rules ({validationRules.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('APPROVALS')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                activeTab === 'APPROVALS'
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Approval Processes ({approvalProcesses.length})
                        </button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
                {activeTab === 'OWD' && (
                    <div className="space-y-5">
                        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-primary" />
                                        Baseline Organization-Wide Default (OWD)
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Controls baseline record visibility before Sharing Rules
                                        open access to additional System or Custom Roles.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={owdMode}
                                        onChange={e => setOwdMode(e.target.value as OwdMode)}
                                        data-testid="owd-mode-select"
                                        className="h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground"
                                    >
                                        <option value="PUBLIC_READ_WRITE">
                                            Public Read / Write (Default)
                                        </option>
                                        <option value="PUBLIC_READ_ONLY">
                                            Public Read-Only (Owner + Shared Edit)
                                        </option>
                                        <option value="PRIVATE">
                                            Private (Owner + Admins + Sharing Rules Only)
                                        </option>
                                    </select>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={handleSaveOwd}
                                    >
                                        Save OWD
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-border p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-foreground">
                                Criteria &amp; Role Sharing Rules
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5 items-end">
                                <div className="space-y-1 md:col-span-2">
                                    <Label className="text-xs">Rule Name</Label>
                                    <Input
                                        value={shareName}
                                        onChange={e => setShareName(e.target.value)}
                                        placeholder="e.g., Warden Girls Wing Access"
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Criteria Field</Label>
                                    <select
                                        value={shareField}
                                        onChange={e => setShareField(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        <option value="__all__">All Records</option>
                                        {fields.map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                {f.label} ({f.apiName})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {shareField !== '__all__' && (
                                    <>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Operator &amp; Value</Label>
                                            <div className="flex gap-1">
                                                <select
                                                    value={shareOp}
                                                    onChange={e =>
                                                        setShareOp(
                                                            e.target
                                                                .value as SharingCriteriaOperator,
                                                        )
                                                    }
                                                    className="h-8 rounded border border-border bg-card px-1.5 text-xs text-foreground"
                                                >
                                                    <option value="eq">=</option>
                                                    <option value="neq">!=</option>
                                                    <option value="contains">contains</option>
                                                    <option value="gt">&gt;</option>
                                                    <option value="lt">&lt;</option>
                                                </select>
                                                <Input
                                                    value={shareVal}
                                                    onChange={e => setShareVal(e.target.value)}
                                                    placeholder="Value"
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="space-y-1">
                                    <Label className="text-xs">Share With Role</Label>
                                    <select
                                        value={shareRole}
                                        onChange={e => setShareRole(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        {roleOptions.map(r => (
                                            <option key={r.code} value={r.code}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Access</Label>
                                    <div className="flex gap-1.5">
                                        <select
                                            value={shareAccess}
                                            onChange={e =>
                                                setShareAccess(
                                                    e.target.value as 'READ' | 'READ_WRITE',
                                                )
                                            }
                                            className="h-8 flex-1 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            <option value="READ">Read Only</option>
                                            <option value="READ_WRITE">Read / Write</option>
                                        </select>
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={isPending}
                                            onClick={handleAddSharingRule}
                                            className="h-8 text-xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {sharingRules.length === 0 ? (
                                <p className="text-xs text-muted-foreground pt-2">
                                    No custom sharing rules defined yet.
                                </p>
                            ) : (
                                <div className="divide-y divide-border pt-2">
                                    {sharingRules.map(rule => (
                                        <div
                                            key={rule.id}
                                            className="flex items-center justify-between py-2 text-xs"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-foreground">
                                                    {rule.name}
                                                </span>
                                                <Badge variant="outline" className="font-mono">
                                                    {rule.criteriaField
                                                        ? `${rule.criteriaField} ${rule.criteriaOperator} "${rule.criteriaValue ?? ''}"`
                                                        : 'ALL RECORDS'}
                                                </Badge>
                                                <span className="text-muted-foreground">→</span>
                                                <Badge variant="outline" className="text-primary">
                                                    {rule.sharedWithRole} ({rule.accessLevel})
                                                </Badge>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={isPending}
                                                onClick={() => handleDeleteSharingRule(rule.id)}
                                                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'VALIDATION' && (
                    <div className="space-y-5">
                        <div className="rounded-xl border border-border p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-primary" />
                                New Cross-Field Boolean Formula Validation Rule
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                When the boolean formula evaluates to <code>TRUE</code>, record save
                                is blocked and the error message is shown.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Rule Name</Label>
                                    <Input
                                        value={valName}
                                        onChange={e => setValName(e.target.value)}
                                        placeholder="e.g., High_Concession_Requires_Justification"
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Error Display Location</Label>
                                    <select
                                        value={valErrorField}
                                        onChange={e => setValErrorField(e.target.value)}
                                        className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        <option value="__banner__">Top of Form Banner</option>
                                        {fields.map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                Field: {f.label} ({f.apiName})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">User-Facing Error Message</Label>
                                    <Input
                                        value={valMessage}
                                        onChange={e => setValMessage(e.target.value)}
                                        placeholder="e.g., Concessions above 25% require written justification."
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">
                                    Error Condition Formula (Blocks Save When TRUE)
                                </Label>
                                <Input
                                    value={valFormula}
                                    onChange={e => setValFormula(e.target.value)}
                                    placeholder='e.g., concession_pct > 25 && ISBLANK(justification)'
                                    className="h-9 font-mono text-xs"
                                />
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <span className="text-[11px] text-muted-foreground">
                                        Functions:
                                    </span>
                                    {FORMULA_HELPERS.map(fn => (
                                        <button
                                            key={fn.label}
                                            type="button"
                                            onClick={() =>
                                                setValFormula(prev =>
                                                    prev ? `${prev} ${fn.snippet}` : fn.snippet,
                                                )
                                            }
                                            className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground hover:bg-accent"
                                        >
                                            {fn.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                    <span className="text-[11px] text-muted-foreground">
                                        Insert Field:
                                    </span>
                                    {fields.slice(0, 10).map(f => (
                                        <button
                                            key={f.apiName}
                                            type="button"
                                            onClick={() =>
                                                setValFormula(prev =>
                                                    prev ? `${prev} ${f.apiName}` : f.apiName,
                                                )
                                            }
                                            className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-muted"
                                        >
                                            {f.apiName}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Live Formula Sandbox Tester */}
                            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                                        <FlaskConical className="w-3.5 h-3.5 text-primary" />
                                        Live Formula Sandbox Tester
                                    </span>
                                    {valFormula.trim() && (
                                        <Badge
                                            variant="outline"
                                            className={
                                                liveFormulaTriggered
                                                    ? 'bg-destructive-subtle text-destructive border-destructive/30'
                                                    : 'bg-success-subtle text-success border-success/30'
                                            }
                                        >
                                            {liveFormulaTriggered
                                                ? 'BLOCKED — Formula Evaluated TRUE'
                                                : 'VALID — Save Allowed (FALSE)'}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={sampleFieldKey}
                                        onChange={e => setSampleFieldKey(e.target.value)}
                                        className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                    >
                                        {fields.map(f => (
                                            <option key={f.apiName} value={f.apiName}>
                                                {f.apiName}
                                            </option>
                                        ))}
                                    </select>
                                    <Input
                                        value={sampleFieldVal}
                                        onChange={e => setSampleFieldVal(e.target.value)}
                                        placeholder="Sample value…"
                                        className="h-8 w-44 text-xs"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            if (!sampleFieldKey) return;
                                            setSampleRecord(prev => ({
                                                ...prev,
                                                [sampleFieldKey]: sampleFieldVal,
                                            }));
                                            setSampleFieldVal('');
                                        }}
                                        className="h-8 text-xs"
                                    >
                                        Set Sample Field
                                    </Button>
                                    {Object.keys(sampleRecord).length > 0 && (
                                        <span className="font-mono text-[11px] text-muted-foreground">
                                            Sample: {JSON.stringify(sampleRecord)}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={handleSaveValidationRule}
                                >
                                    Save Validation Rule
                                </Button>
                            </div>
                        </div>

                        {validationRules.length > 0 && (
                            <div className="rounded-xl border border-border divide-y divide-border">
                                {validationRules.map(rule => (
                                    <div
                                        key={rule.id}
                                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-foreground">
                                                    {rule.name}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        rule.isActive
                                                            ? 'bg-success-subtle text-success border-success/30'
                                                            : 'bg-muted text-muted-foreground'
                                                    }
                                                >
                                                    {rule.isActive ? 'ACTIVE' : 'PAUSED'}
                                                </Badge>
                                                {rule.errorField && (
                                                    <Badge variant="outline" className="font-mono">
                                                        Field: {rule.errorField}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="font-mono text-[11px] text-primary">
                                                {rule.errorConditionFormula}
                                            </div>
                                            <div className="text-muted-foreground">
                                                Error: &ldquo;{rule.errorMessage}&rdquo;
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                disabled={isPending}
                                                onClick={() => handleToggleValidationRule(rule)}
                                                className="h-7 text-xs"
                                            >
                                                {rule.isActive ? 'Pause' : 'Activate'}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={isPending}
                                                onClick={() => handleDeleteValidationRule(rule.id)}
                                                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'APPROVALS' && (
                    <div className="space-y-5">
                        <div className="rounded-xl border border-border p-4 space-y-4">
                            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <GitPullRequest className="w-4 h-4 text-primary" />
                                New Declarative Multi-Step Approval Process
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs">Process Name</Label>
                                    <Input
                                        value={procName}
                                        onChange={e => setProcName(e.target.value)}
                                        placeholder="e.g., High Value Scholarship 2-Step Approval"
                                        className="h-8 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        Entry Criteria Formula (Optional — blank matches all)
                                    </Label>
                                    <Input
                                        value={procEntryFormula}
                                        onChange={e => setProcEntryFormula(e.target.value)}
                                        placeholder="e.g., amount > 25000"
                                        className="h-8 font-mono text-xs"
                                    />
                                </div>
                                <div className="flex items-end pb-1">
                                    <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={procLockOnSubmit}
                                            onChange={e => setProcLockOnSubmit(e.target.checked)}
                                            className="rounded border-border"
                                        />
                                        Lock record against non-admin edits while PENDING
                                    </label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs">Ordered Approval Steps</Label>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                            setProcSteps(prev => [
                                                ...prev,
                                                {
                                                    stepNumber: prev.length + 1,
                                                    stepName: `Step ${prev.length + 1} Review`,
                                                    approverRole: 'PRINCIPAL',
                                                },
                                            ])
                                        }
                                        className="h-7 text-xs"
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
                                    </Button>
                                </div>
                                {procSteps.map((step, idx) => (
                                    <div
                                        key={idx}
                                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs"
                                    >
                                        <Badge variant="outline" className="font-mono">
                                            Step {idx + 1}
                                        </Badge>
                                        <Input
                                            value={step.stepName}
                                            onChange={e => {
                                                const stepName = e.target.value;
                                                setProcSteps(prev =>
                                                    prev.map((s, i) =>
                                                        i === idx ? { ...s, stepName } : s,
                                                    ),
                                                );
                                            }}
                                            placeholder="Step name"
                                            className="h-8 max-w-xs text-xs"
                                        />
                                        <select
                                            value={step.approverRole}
                                            onChange={e => {
                                                const approverRole = e.target.value;
                                                setProcSteps(prev =>
                                                    prev.map((s, i) =>
                                                        i === idx ? { ...s, approverRole } : s,
                                                    ),
                                                );
                                            }}
                                            className="h-8 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            {roleOptions.map(r => (
                                                <option key={r.code} value={r.code}>
                                                    Approver: {r.label}
                                                </option>
                                            ))}
                                        </select>
                                        {procSteps.length > 1 && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    setProcSteps(prev =>
                                                        prev.filter((_, i) => i !== idx),
                                                    )
                                                }
                                                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        Auto Field Update on Final Approval (Optional)
                                    </Label>
                                    <div className="flex gap-1.5">
                                        <select
                                            value={approveUpdateField}
                                            onChange={e => setApproveUpdateField(e.target.value)}
                                            className="h-8 flex-1 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            <option value="__none__">None (Default)</option>
                                            {fields.map(f => (
                                                <option key={f.apiName} value={f.apiName}>
                                                    {f.label} ({f.apiName})
                                                </option>
                                            ))}
                                        </select>
                                        {approveUpdateField !== '__none__' && (
                                            <Input
                                                value={approveUpdateValue}
                                                onChange={e =>
                                                    setApproveUpdateValue(e.target.value)
                                                }
                                                placeholder="Value"
                                                className="h-8 w-36 text-xs"
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">
                                        Auto Field Update on Rejection (Optional)
                                    </Label>
                                    <div className="flex gap-1.5">
                                        <select
                                            value={rejectUpdateField}
                                            onChange={e => setRejectUpdateField(e.target.value)}
                                            className="h-8 flex-1 rounded border border-border bg-card px-2 text-xs text-foreground"
                                        >
                                            <option value="__none__">None (Default)</option>
                                            {fields.map(f => (
                                                <option key={f.apiName} value={f.apiName}>
                                                    {f.label} ({f.apiName})
                                                </option>
                                            ))}
                                        </select>
                                        {rejectUpdateField !== '__none__' && (
                                            <Input
                                                value={rejectUpdateValue}
                                                onChange={e =>
                                                    setRejectUpdateValue(e.target.value)
                                                }
                                                placeholder="Value"
                                                className="h-8 w-36 text-xs"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={isPending}
                                    onClick={handleSaveApprovalProcess}
                                >
                                    Publish Approval Process
                                </Button>
                            </div>
                        </div>

                        {approvalProcesses.length > 0 && (
                            <div className="rounded-xl border border-border divide-y divide-border">
                                {approvalProcesses.map(proc => (
                                    <div
                                        key={proc.id}
                                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
                                    >
                                        <div className="space-y-1.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                                                <span className="font-semibold text-foreground">
                                                    {proc.name}
                                                </span>
                                                {proc.lockRecordOnSubmit && (
                                                    <Badge variant="outline" className="font-mono">
                                                        Locks Record
                                                    </Badge>
                                                )}
                                                {proc.entryCriteriaFormula && (
                                                    <Badge
                                                        variant="outline"
                                                        className="font-mono text-primary"
                                                    >
                                                        When: {proc.entryCriteriaFormula}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                                                {proc.steps.map((s, i) => (
                                                    <span
                                                        key={s.stepNumber}
                                                        className="inline-flex items-center gap-1"
                                                    >
                                                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                                                            {s.stepNumber}. {s.stepName} (
                                                            {s.approverRole})
                                                        </span>
                                                        {i < proc.steps.length - 1 && (
                                                            <span>→</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={isPending}
                                            onClick={() => handleDeleteApprovalProcess(proc.id)}
                                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
