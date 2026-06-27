import { getTenantHQPoliciesAction } from '@/lib/actions/tenant-policies';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Settings2 } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function SchoolSettingsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { policies } = await getTenantHQPoliciesAction();
    
    // Helper to find an enforced policy value
    const getEnforcedPolicy = (key: string) => policies.find((p: any) => p.policyKey === key && p.isHardBlock);

    const minAttendancePolicy = getEnforcedPolicy('MIN_ATTENDANCE_PCT');
    const lateFeePolicy = getEnforcedPolicy('LATE_FEE_AMOUNT');
    const maxDiscountPolicy = getEnforcedPolicy('MAX_DISCOUNT_PCT');

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">School Operations Settings</h1>
                    <p className="text-slate-500 mt-1">Configure campus-level parameters and policies.</p>
                </div>
                <Badge variant="outline" className="bg-slate-50">Local Settings</Badge>
            </div>

            <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-slate-500" /> Academic & Operational Limits
                    </CardTitle>
                    <CardDescription>
                        Settings with a lock icon are mandated by your Multi-Campus Headquarters and cannot be overridden locally.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                Minimum Attendance for Finals (%)
                                {minAttendancePolicy && <Lock className="w-3.5 h-3.5 text-red-500" />}
                            </label>
                            {minAttendancePolicy ? (
                                <div className="p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-center justify-between">
                                    <span className="font-bold text-red-900">{minAttendancePolicy.policyValue}%</span>
                                    <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 text-[10px]">HQ Mandated</Badge>
                                </div>
                            ) : (
                                <input type="number" defaultValue="75" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            )}
                            {minAttendancePolicy && (
                                <p className="text-xs text-slate-500">Locked globally by {minAttendancePolicy.policyName}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                Default Late Fee Penalty (₹)
                                {lateFeePolicy && <Lock className="w-3.5 h-3.5 text-red-500" />}
                            </label>
                            {lateFeePolicy ? (
                                <div className="p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-center justify-between">
                                    <span className="font-bold text-red-900">₹{lateFeePolicy.policyValue}</span>
                                    <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 text-[10px]">HQ Mandated</Badge>
                                </div>
                            ) : (
                                <input type="number" defaultValue="100" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                Max Sibling Discount (%)
                                {maxDiscountPolicy && <Lock className="w-3.5 h-3.5 text-red-500" />}
                            </label>
                            {maxDiscountPolicy ? (
                                <div className="p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-center justify-between">
                                    <span className="font-bold text-red-900">{maxDiscountPolicy.policyValue}%</span>
                                    <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 text-[10px]">HQ Mandated</Badge>
                                </div>
                            ) : (
                                <input type="number" defaultValue="20" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                Standard Grace Period (Days)
                            </label>
                            {/* Unlocked field example */}
                            <input type="number" defaultValue="5" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                        </div>

                    </div>

                    <div className="pt-6 mt-6 border-t border-slate-100 flex justify-end">
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 rounded-lg transition-colors">
                            Save Local Settings
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
