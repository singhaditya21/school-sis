'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MetadataField, createCustomField } from '@/lib/actions/metadata-engine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export default function FieldManagerClient({ objectId, initialFields }: { objectId: string, initialFields: MetadataField[] }) {
    const router = useRouter();
    const [fields, setFields] = useState<MetadataField[]>(initialFields);
    const [isAdding, setIsAdding] = useState(false);
    
    // New Field State
    const [newLabel, setNewLabel] = useState('');
    const [newApiName, setNewApiName] = useState('');
    const [newType, setNewType] = useState('TEXT');
    const [newRequired, setNewRequired] = useState(false);
    const [newOptions, setNewOptions] = useState('');

    const handleCreateField = async () => {
        try {
            const fieldData = {
                label: newLabel,
                apiName: newApiName,
                dataType: newType,
                isRequired: newRequired,
                picklistOptions: newType === 'PICKLIST' ? newOptions.split(',').map(s => s.trim()) : null
            };
            const created = await createCustomField(objectId, fieldData);
            
            setFields([...fields, {
                id: created.id,
                label: created.label,
                objectId,
                apiName: created.api_name,
                dataType: created.data_type,
                isCustom: true,
                isRequired: created.is_required,
                defaultValue: created.default_value ?? null,
                picklistOptions: created.picklist_options,
                validationRules: created.validation_rules ?? {},
                status: created.status,
                version: created.version ?? 1,
            }]);
            
            setIsAdding(false);
            setNewLabel('');
            setNewApiName('');
            setNewType('TEXT');
            setNewOptions('');
            if (created.object_id && created.object_id !== objectId) {
                router.replace(`/settings/objects/${created.object_id}`);
            } else {
                router.refresh();
            }
        } catch (e: any) {
            alert(e.message || "Failed to create field");
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Fields & Relationships</CardTitle>
                <Dialog open={isAdding} onOpenChange={setIsAdding}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus className="w-4 h-4 mr-2" /> New Custom Field</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Custom Field</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Field Label</Label>
                                <Input value={newLabel} onChange={e => {
                                    setNewLabel(e.target.value);
                                    if (!newApiName || newApiName === newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')) {
                                        setNewApiName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                                    }
                                }} placeholder="e.g. Blood Group" />
                            </div>
                            <div className="space-y-2">
                                <Label>API Name (internal)</Label>
                                <Input value={newApiName} onChange={e => setNewApiName(e.target.value)} placeholder="e.g. blood_group" />
                            </div>
                            <div className="space-y-2">
                                <Label>Data Type</Label>
                                <Select value={newType} onValueChange={setNewType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TEXT">Text</SelectItem>
                                        <SelectItem value="NUMBER">Number</SelectItem>
                                        <SelectItem value="DATE">Date</SelectItem>
                                        <SelectItem value="BOOLEAN">Checkbox (Boolean)</SelectItem>
                                        <SelectItem value="PICKLIST">Picklist (Dropdown)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            {newType === 'PICKLIST' && (
                                <div className="space-y-2">
                                    <Label>Options (comma separated)</Label>
                                    <Input value={newOptions} onChange={e => setNewOptions(e.target.value)} placeholder="A+, A-, B+, O+" />
                                </div>
                            )}

                            <div className="flex items-center space-x-2 pt-2">
                                <Switch checked={newRequired} onCheckedChange={setNewRequired} id="required" />
                                <Label htmlFor="required">Required Field</Label>
                            </div>

                            <Button className="w-full mt-4" onClick={handleCreateField}>Create Field</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium">Field Label</th>
                                <th className="px-4 py-3 font-medium">API Name</th>
                                <th className="px-4 py-3 font-medium">Data Type</th>
                                <th className="px-4 py-3 font-medium text-center">Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map((f, i) => (
                                <tr key={f.id || i} className="border-b last:border-0 hover:bg-slate-50 group">
                                    <td className="px-4 py-3 flex items-center font-medium text-slate-900">
                                        <GripVertical className="w-4 h-4 text-slate-300 mr-2 opacity-0 group-hover:opacity-100 cursor-move" />
                                        {f.label}
                                        {f.isRequired && <span className="text-red-500 ml-1">*</span>}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.apiName}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded border">
                                            {f.dataType}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {f.isCustom ? (
                                            <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded border border-purple-200">Custom</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">Standard</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
