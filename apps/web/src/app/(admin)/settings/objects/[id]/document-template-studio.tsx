'use client';

/**
 * @module app/(admin)/settings/objects/[id]/document-template-studio
 *
 * Track E: Declarative Document & Certificate Merge Studio (Salesforce OmniStudio DocGen Parity):
 * Allows administrators to design official HTML/PDF document templates (Admission Offer Letters,
 * Scholarship Certificates, Transfer/Bonafide Certificates) using merge tokens (`{{field_api_name}}`,
 * `{{RECORD_ID}}`, `{{ISSUED_DATE}}`) with tamper-evident verification codes.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileSignature, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    saveObjectDocumentTemplates,
    type MetadataField,
    type MetadataLayout,
} from '@/lib/actions/metadata-engine';
import type {
    DocumentTemplateCategory,
    MetadataDocumentTemplate,
} from '@/lib/metadata/platform';

const STARTER_TEMPLATES: MetadataDocumentTemplate[] = [
    {
        id: 'tpl-offer-letter',
        name: 'Official Admission & Scholarship Offer Letter',
        category: 'OFFER_LETTER',
        headerTitle: 'Official Offer of Admission',
        bodyMarkdown:
            'Dear {{full_name}}{{student_name}}{{candidate_name}},\n\nCongratulations! Your application (Ref #{{RECORD_ID}}) for {{OBJECT_NAME}} has been approved.\n\nCurrent Stage: {{pipeline_stage}}{{status}}\nIssued Date: {{ISSUED_DATE}}\n\nPlease present this verified letter during campus registration.',
        footerText: 'Office of Admissions & Registrar · ScholarMind Education Cloud',
        includeVerificationBadge: true,
    },
    {
        id: 'tpl-bonafide-cert',
        name: 'Bonafide / Merit Certificate',
        category: 'CERTIFICATE',
        headerTitle: 'Certificate of Bonafide Standing',
        bodyMarkdown:
            'This is to certify that {{full_name}}{{student_name}}{{candidate_name}} (Reference #{{RECORD_ID}}) is recorded in {{OBJECT_NAME}} as of {{ISSUED_DATE}}.',
        footerText: 'Digitally Verified Certificate · ScholarMind Document Studio',
        includeVerificationBadge: true,
    },
];

export default function DocumentTemplateStudioClient({
    objectId,
    objectName,
    fields,
    initialLayouts,
}: {
    objectId: string;
    objectName: string;
    fields: MetadataField[];
    initialLayouts: MetadataLayout[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const formLayout = initialLayouts.find(l => l.layoutType === 'FORM');
    const existingTemplates = ((formLayout?.schema as Record<string, unknown> | undefined)
        ?.documentTemplates || []) as MetadataDocumentTemplate[];

    const [templates, setTemplates] = useState<MetadataDocumentTemplate[]>(
        existingTemplates.length > 0 ? existingTemplates : STARTER_TEMPLATES,
    );
    const [activeIdx, setActiveIdx] = useState<number>(0);

    const activeTemplate = templates[activeIdx] || templates[0];

    const updateActiveTemplate = (patch: Partial<MetadataDocumentTemplate>) => {
        setTemplates(prev =>
            prev.map((tpl, idx) => (idx === activeIdx ? { ...tpl, ...patch } : tpl)),
        );
    };

    const handleInsertMergeToken = (tokenName: string) => {
        if (!activeTemplate) return;
        const token = `{{${tokenName}}}`;
        updateActiveTemplate({
            bodyMarkdown: `${activeTemplate.bodyMarkdown} ${token}`,
        });
    };

    const handleAddTemplate = () => {
        const nextTpl: MetadataDocumentTemplate = {
            id: `tpl-${Date.now()}`,
            name: `${objectName} Certificate ${templates.length + 1}`,
            category: 'CERTIFICATE',
            headerTitle: `${objectName} Official Certificate`,
            bodyMarkdown: `This document certifies record #{{RECORD_ID}} in ${objectName} issued on {{ISSUED_DATE}}.`,
            footerText: 'Issued via ScholarMind Document Studio',
            includeVerificationBadge: true,
        };
        setTemplates(prev => [...prev, nextTpl]);
        setActiveIdx(templates.length);
    };

    const handleDeleteTemplate = (idxToDelete: number) => {
        if (templates.length <= 1) {
            toast.error('At least one document template must remain.');
            return;
        }
        setTemplates(prev => prev.filter((_, idx) => idx !== idxToDelete));
        setActiveIdx(0);
    };

    const handleSaveTemplates = () => {
        startTransition(async () => {
            const res = await saveObjectDocumentTemplates(objectId, templates);
            if (!res.success) {
                toast.error(res.error || 'Failed to save document templates.');
                return;
            }
            toast.success(`Saved ${templates.length} Document Merge Template(s) for ${objectName}.`);
            if (res.objectId && res.objectId !== objectId) {
                router.replace(`/settings/objects/${res.objectId}`);
            } else {
                router.refresh();
            }
        });
    };

    return (
        <Card className="border-border shadow-sm" data-testid="document-template-studio">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <FileSignature className="w-5 h-5 text-primary" />
                        <CardTitle className="text-lg">
                            OmniStudio Document &amp; Certificate Designer
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-mono">
                            {templates.length} TEMPLATE{templates.length === 1 ? '' : 'S'}
                        </Badge>
                    </div>
                    <CardDescription>
                        Design official Offer Letters, Scholarship Grants, and Bonafide Certificates with merge tokens (`&#123;&#123;field&#125;&#125;`) for 1-click generation on the 360° Record Console.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddTemplate}
                        data-testid="add-doc-template-btn"
                        className="h-8 text-xs gap-1"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        New Template
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        onClick={handleSaveTemplates}
                        data-testid="save-doc-templates-btn"
                        className="h-8 text-xs gap-1.5"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {isPending ? 'Saving...' : 'Save Templates'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
                {/* Template Selector Pills */}
                <div className="flex flex-wrap items-center gap-2">
                    {templates.map((tpl, idx) => (
                        <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setActiveIdx(idx)}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                idx === activeIdx
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'
                            }`}
                        >
                            <span>{tpl.name}</span>
                            <Badge variant="outline" className="text-[9px] font-mono">
                                {tpl.category}
                            </Badge>
                        </button>
                    ))}
                </div>

                {activeTemplate && (
                    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Template Name</Label>
                                <Input
                                    value={activeTemplate.name}
                                    onChange={e => updateActiveTemplate({ name: e.target.value })}
                                    data-testid="doc-template-name-input"
                                    className="text-xs h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Document Category</Label>
                                <Select
                                    value={activeTemplate.category}
                                    onValueChange={val =>
                                        updateActiveTemplate({
                                            category: val as DocumentTemplateCategory,
                                        })
                                    }
                                >
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OFFER_LETTER">Offer Letter</SelectItem>
                                        <SelectItem value="CERTIFICATE">
                                            Bonafide / Completion Certificate
                                        </SelectItem>
                                        <SelectItem value="SCHOLARSHIP_LETTER">
                                            Scholarship Grant Letter
                                        </SelectItem>
                                        <SelectItem value="FEE_RECEIPT">
                                            Fee / Deposit Acknowledgment
                                        </SelectItem>
                                        <SelectItem value="CUSTOM">Custom Document</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Document Letterhead Title</Label>
                                <Input
                                    value={activeTemplate.headerTitle}
                                    onChange={e =>
                                        updateActiveTemplate({ headerTitle: e.target.value })
                                    }
                                    className="text-xs h-9"
                                />
                            </div>
                        </div>

                        {/* Merge Token Picker Bar */}
                        <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                Click to Insert Field Merge Token
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                                {['RECORD_ID', 'ISSUED_DATE', 'OBJECT_NAME'].map(sysToken => (
                                    <button
                                        key={sysToken}
                                        type="button"
                                        onClick={() => handleInsertMergeToken(sysToken)}
                                        className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-primary/20"
                                    >
                                        {`{{${sysToken}}}`}
                                    </button>
                                ))}
                                {fields.map(f => (
                                    <button
                                        key={f.apiName}
                                        type="button"
                                        onClick={() => handleInsertMergeToken(f.apiName)}
                                        data-testid={`insert-merge-token-${f.apiName}`}
                                        className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground hover:border-primary"
                                    >
                                        {`{{${f.apiName}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Document Body (with Merge Tokens)</Label>
                            <textarea
                                value={activeTemplate.bodyMarkdown}
                                onChange={e =>
                                    updateActiveTemplate({ bodyMarkdown: e.target.value })
                                }
                                rows={5}
                                data-testid="doc-template-body-textarea"
                                className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="doc-verify-badge"
                                    checked={activeTemplate.includeVerificationBadge}
                                    onCheckedChange={checked =>
                                        updateActiveTemplate({ includeVerificationBadge: checked })
                                    }
                                />
                                <Label htmlFor="doc-verify-badge" className="text-xs">
                                    Include Tamper-Evident Verification Ref (`SM-DOC-YYYY-...`)
                                </Label>
                            </div>
                            {templates.length > 1 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteTemplate(activeIdx)}
                                    className="h-7 text-xs text-destructive gap-1"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Remove Template
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
