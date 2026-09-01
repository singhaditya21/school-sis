import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getStudentVisasAction, getHostFamiliesAction, getInternationalPlacementsAction } from '@/lib/actions/international';

export default async function InternationalDashboard() {
    const visas = await getStudentVisasAction();
    const families = await getHostFamiliesAction();
    const placements = await getInternationalPlacementsAction();

    return (
        <div className="max-w-7xl mx-auto p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">International Operations & Visas</h1>
                <p className="text-muted-foreground">Manage student visas, homestay host families, and international placements.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border border-blue-200 bg-blue-50/50 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <span>🛂</span> Visa Compliance
                        </CardTitle>
                        <CardDescription>Track Tier 4 / F-1 expirations and compliance status.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">{visas.length} Active Visas</div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <span>🏠</span> Host Families
                        </CardTitle>
                        <CardDescription>Manage background-checked homestay placements.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">{families.length} Registered Families</div>
                    </CardContent>
                </Card>

                <Card className="border border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <span>🌍</span> Placements
                        </CardTitle>
                        <CardDescription>Homestay and school boarding placements.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">{placements.length} Placements</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Visa Tracker List */}
                <Card className="border border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Visa Compliance Tracker</CardTitle>
                        <CardDescription>Monitor passport and visa expiration schedules.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted border-b text-xs text-muted-foreground uppercase font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Student</th>
                                        <th className="px-6 py-3">Visa Type</th>
                                        <th className="px-6 py-3">Passport</th>
                                        <th className="px-6 py-3">Expires</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visas.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No student visas tracked.</td>
                                        </tr>
                                    ) : (
                                        visas.map((v: { id: string; studentName: string; visaType: string; passportNumber: string; expirationDate: string | Date }) => (
                                            <tr key={v.id} className="hover:bg-muted">
                                                <td className="px-6 py-4 font-semibold text-foreground">{v.studentName}</td>
                                                <td className="px-6 py-4"><Badge variant="outline">{v.visaType}</Badge></td>
                                                <td className="px-6 py-4 font-mono text-xs">{v.passportNumber}</td>
                                                <td className="px-6 py-4 text-xs text-muted-foreground">{new Date(v.expirationDate).toLocaleDateString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Host Families List */}
                <Card className="border border-border shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Host Family Registry</CardTitle>
                        <CardDescription>Verified homestay provider contacts.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted border-b text-xs text-muted-foreground uppercase font-semibold">
                                    <tr>
                                        <th className="px-6 py-3">Family Name</th>
                                        <th className="px-6 py-3">Address</th>
                                        <th className="px-6 py-3">Phone</th>
                                        <th className="px-6 py-3">Background Check</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {families.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No host families registered.</td>
                                        </tr>
                                    ) : (
                                        families.map((f: { id: string; familyName: string; address: string; phone: string; backgroundChecked: string | Date | null }) => (
                                            <tr key={f.id} className="hover:bg-muted">
                                                <td className="px-6 py-4 font-semibold text-foreground">{f.familyName}</td>
                                                <td className="px-6 py-4 text-xs text-muted-foreground">{f.address}</td>
                                                <td className="px-6 py-4 font-mono text-xs">{f.phone}</td>
                                                <td className="px-6 py-4 text-xs">
                                                    {f.backgroundChecked ? (
                                                        <Badge className="bg-green-100 text-green-800 border-0">Passed ({new Date(f.backgroundChecked).toLocaleDateString()})</Badge>
                                                    ) : (
                                                        <Badge className="bg-amber-100 text-amber-800 border-0">Pending</Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
