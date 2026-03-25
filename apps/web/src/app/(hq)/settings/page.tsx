import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function HQSettingsPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="pb-4 border-b border-slate-800">
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span className="text-indigo-400">⚙️</span> Global Policy Engine & White-Labeling
                </h1>
                <p className="text-slate-400 mt-1">Configure global operational policies, custom branding, and CNAME domains per tenant.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Global Policies Component */}
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Global Data & Privacy Policies</CardTitle>
                        <CardDescription className="text-slate-400">Data retention thresholds applied across all 12 campuses.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Student Record Retention (Years)</label>
                            <input type="number" defaultValue="7" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500" />
                            <p className="text-xs text-slate-500">Auto-anonymize alumni records after this period to comply with DPDP Act.</p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Financial Audit Log Immutability</label>
                            <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500">
                                <option>Strict (Block all modifications to invoices)</option>
                                <option>Soft (Allow modifications with Principal signature)</option>
                            </select>
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-slate-300">Force Hardware MFA</h4>
                                    <p className="text-xs text-slate-500">Require FIDO2/WebAuthn for all campus admins.</p>
                                </div>
                                <div className="w-10 h-5 bg-indigo-600 rounded-full relative">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>
                        </div>

                        <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                            Apply Global Policy Update
                        </button>
                    </CardContent>
                </Card>

                {/* White-Labeling Component */}
                <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                    <CardHeader className="pb-4 border-b border-slate-700/50 mb-4">
                        <CardTitle className="text-lg">Tenant White-Labeling</CardTitle>
                        <CardDescription className="text-slate-400">Manage CNAME records and visual branding for individual campuses.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        
                        <div className="space-y-4">
                            {[
                                { campus: 'Delhi Main Campus', domain: 'portal.delhischool.edu.in', status: 'VERIFIED', color: 'bg-emerald-500' },
                                { campus: 'Pune Coaching Hub', domain: 'targetjee.coachinginstitute.org', status: 'PENDING', color: 'bg-amber-500' },
                            ].map((tenant, i) => (
                                <div key={i} className="p-4 border border-slate-700 rounded-xl bg-slate-900/50">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-medium text-white text-sm">{tenant.campus}</h4>
                                            <p className="text-xs text-slate-400 font-mono mt-1">{tenant.domain}</p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tenant.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                            {tenant.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-4 text-xs font-medium">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500">Primary:</span>
                                            <div className={`w-4 h-4 rounded-full ${tenant.color}`}></div>
                                        </div>
                                        <button className="text-indigo-400 hover:text-indigo-300 ml-auto transition-colors">Edit Branding →</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button className="flex items-center justify-center gap-2 w-full border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium py-2 rounded-lg text-sm transition-colors mt-2">
                            <span>+</span> Map New CNAME Domain
                        </button>
                        
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
