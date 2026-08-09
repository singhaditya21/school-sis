import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import TallyExportForm from './TallyExportForm';
import { ArrowRightLeft, FileSpreadsheet, Settings2 } from 'lucide-react';

export default async function TallyIntegrationPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    return (
        <div className="max-w-6xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                        <FileSpreadsheet className="w-8 h-8 text-green-600" />
                        Tally ERP 9 / Prime Integration
                    </h1>
                    <p className="text-slate-500 mt-1">Generate Tally-compatible XML from completed tenant payment records.</p>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 px-3 py-1 uppercase tracking-widest text-xs font-bold">
                    Export available
                </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Actions */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border border-slate-200 shadow-sm rounded-xl">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-blue-600" /> Sync Vouchers
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <TallyExportForm />
                        </CardContent>
                    </Card>

                    <div role="note" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        Export history is not yet stored. Each successful export is recorded in the integration audit log; this screen does not invent prior downloads.
                    </div>
                </div>

                {/* Right Column - Ledger Mapping Settings */}
                <div className="lg:col-span-2">
                    <Card className="border border-slate-200 shadow-sm rounded-xl h-full">
                        <CardHeader className="bg-white border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Settings2 className="w-5 h-5 text-slate-700" /> Built-in export mapping
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    Current server-side mappings used in the generated XML.
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-6">
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 flex gap-3">
                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <p>Ensure the Tally Ledger names match <strong>exactly</strong> as configured in Tally (case-sensitive) to prevent import errors.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                                    {/* Mappings List */}
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">ScholarMind System Method</label>
                                        <div className="font-medium text-slate-900 py-2 border-b border-slate-100">CASH</div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Tally Target Ledger Name</label>
                                        <div className="font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">Cash</div>
                                    </div>

                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-slate-900 py-2 border-b border-slate-100">CARD</div>
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">HDFC Bank</div>
                                    </div>

                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-slate-900 py-2 border-b border-slate-100">UPI</div>
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">UPI Collections</div>
                                    </div>

                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-slate-900 py-2 border-b border-slate-100">BANK_TRANSFER</div>
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">Bank Collections</div>
                                    </div>

                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-slate-900 py-2 border-b border-slate-100">ONLINE</div>
                                    </div>
                                    <div className="space-y-1 mt-2">
                                        <div className="font-medium text-green-700 bg-green-50 px-3 py-2 rounded-md">Online Payments</div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
