'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { createGroupPolicyAction } from '@/lib/actions/hq';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';

export default function DeployPolicyForm({ groupId }: { groupId: string }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const [formData, setFormData] = useState({
        policyName: '',
        policyKey: '',
        policyValue: '',
        isHardBlock: true,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createGroupPolicyAction({
                groupId,
                policyName: formData.policyName,
                policyKey: formData.policyKey,
                policyValue: formData.policyValue,
                isHardBlock: formData.isHardBlock,
                documentUrl: 'https://school-sis.com/docs/policies/' + formData.policyKey.toLowerCase(),
            });
            setOpen(false);
            router.refresh();
        } catch (error) {
            console.error('Failed to deploy policy', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full py-6 mt-auto bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors text-md active:scale-95">
                    Deploy New Policy
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" /> Deploy Global Policy
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Policy Name</label>
                        <Input 
                            required 
                            placeholder="e.g. Standard Late Fee Penalty"
                            value={formData.policyName}
                            onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Policy Key (System Identifier)</label>
                        <Select 
                            required 
                            value={formData.policyKey}
                            onValueChange={(val) => setFormData({ ...formData, policyKey: val })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select target system setting" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="LATE_FEE_AMOUNT">LATE_FEE_AMOUNT</SelectItem>
                                <SelectItem value="MIN_ATTENDANCE_PCT">MIN_ATTENDANCE_PCT</SelectItem>
                                <SelectItem value="MAX_DISCOUNT_PCT">MAX_DISCOUNT_PCT</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Enforced Value</label>
                        <Input 
                            required 
                            placeholder="e.g. 150 or 75"
                            value={formData.policyValue}
                            onChange={(e) => setFormData({ ...formData, policyValue: e.target.value })}
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 mt-4">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-slate-900">Hard Block</label>
                            <p className="text-xs text-slate-500">Prevent tenants from changing this value</p>
                        </div>
                        <Switch 
                            checked={formData.isHardBlock}
                            onCheckedChange={(val) => setFormData({ ...formData, isHardBlock: val })}
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 w-full">
                            {loading ? 'Deploying to network...' : 'Force Deploy to All Campuses'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
