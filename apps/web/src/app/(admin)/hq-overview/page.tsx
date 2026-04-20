import { getHQOverviewAction } from '@/lib/actions/hq';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function HQDashboard() {
    const { group, campuses, policies } = await getHQOverviewAction();

    if (!group) {
        return (
            <div className="max-w-7xl mx-auto p-8 flex flex-col items-center justify-center min-h-[60vh]">
                <div className="text-6xl mb-4">🌍</div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">No Headquarters Configured</h1>
                <p className="text-gray-500 mb-6">You are not currently mapped to an active Multi-Campus HQ.</p>
                <Button className="bg-slate-900 border-0">Establish New HQ Group</Button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-8 bg-slate-50 min-h-screen space-y-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{group.name} - Global HQ</h1>
                    <p className="text-slate-500 mt-1">Command Center ({group.headquartersCity})</p>
                </div>
                <Badge variant="outline" className="px-4 py-2 bg-purple-100 border-purple-200 text-purple-800 text-sm font-semibold uppercase tracking-widest">Super Admin</Badge>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-white border-b border-slate-100 pb-4">
                        <CardTitle className="text-xl">Network Hierarchy</CardTitle>
                        <CardDescription>Sub-campuses reporting to this HQ</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 bg-white">
                        <div className="divide-y divide-slate-100">
                            {campuses.length === 0 && <div className="p-6 text-slate-500 text-sm">No sub-campuses mapped.</div>}
                            {campuses.map((campus) => (
                                <div key={campus.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                    <div>
                                        <p className="font-semibold text-slate-900">{campus.name || 'Unnamed Tenant'}</p>
                                        <p className="text-sm text-slate-500">Region: {campus.region}</p>
                                    </div>
                                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200">{campus.campusType}</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                    <CardHeader className="bg-white border-b border-slate-100 pb-4">
                        <CardTitle className="text-xl">Group Policy Deployment</CardTitle>
                        <CardDescription>Push global mandates across all regions</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 bg-white flex flex-col justify-between h-[100%]">
                        <div className="space-y-4 mb-8">
                            {policies.length === 0 ? (
                                <p className="text-sm text-slate-500">No active global policies deployed.</p>
                            ) : (
                                policies.map((policy) => (
                                    <div key={policy.id} className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                        <a href={policy.documentUrl} target="_blank" className="text-sm font-medium text-slate-700 hover:text-blue-600 underline-offset-4 hover:underline">
                                            {policy.policyName}
                                        </a>
                                    </div>
                                ))
                            )}
                        </div>
                        <Button className="w-full py-6 mt-auto bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors text-md active:scale-95">
                            Deploy New Policy
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
