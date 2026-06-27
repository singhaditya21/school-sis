import { getTenantHQPoliciesAction } from '@/lib/actions/tenant-policies';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, FileText } from 'lucide-react';

export const metadata = {
    title: 'HQ Policies | ScholarMind',
};

export default async function TenantHQPoliciesPage() {
    const { isMappedToHQ, hqGroup, policies } = await getTenantHQPoliciesAction();

    if (!isMappedToHQ) {
        return (
            <div className="p-8 text-center mt-12 max-w-2xl mx-auto bg-slate-50 border border-slate-200 rounded-xl">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900 mb-2">Independent Campus</h2>
                <p className="text-slate-500">
                    This campus operates independently and is not mapped to a central Multi-Campus Headquarters. 
                    No cascaded policies apply.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Mandated Group Policies</h1>
                    <p className="text-slate-500 mt-1">
                        Viewing enforced guidelines managed by <strong className="text-slate-700">{hqGroup?.name}</strong> HQ.
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-widest text-xs font-bold">
                    HQ Connected
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                {policies.length === 0 ? (
                    <div className="col-span-full p-12 text-center text-slate-500 bg-white border border-slate-200 border-dashed rounded-xl">
                        No policies have been deployed to this campus yet.
                    </div>
                ) : (
                    policies.map((policy: any) => (
                        <Card key={policy.id} className={`border-l-4 transition-all hover:shadow-md ${policy.isHardBlock ? 'border-l-red-500' : 'border-l-amber-500'}`}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-lg leading-tight pr-4">{policy.policyName}</CardTitle>
                                    {policy.isHardBlock ? (
                                        <Badge variant="destructive" className="shrink-0 flex items-center gap-1">
                                            <ShieldAlert className="w-3 h-3" /> Hard Block
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 shrink-0">
                                            Guideline
                                        </Badge>
                                    )}
                                </div>
                                <CardDescription className="font-mono text-xs text-slate-400 mt-1 uppercase">
                                    KEY: {policy.policyKey}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                    <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Enforced Value</span>
                                    <span className="text-lg font-bold text-slate-800">{policy.policyValue}</span>
                                </div>
                                
                                {policy.documentUrl && (
                                    <a href={policy.documentUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 py-2 rounded-md transition-colors">
                                        <FileText className="w-4 h-4" /> View HQ Mandate Document
                                    </a>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
