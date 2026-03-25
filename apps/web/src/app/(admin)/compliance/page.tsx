'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CompliancePage() {
    const [activeTab, setActiveTab] = useState('udise');
    const [isExporting, setIsExporting] = useState(false);

    const handleUdiseExport = async () => {
        setIsExporting(true);
        setTimeout(() => setIsExporting(false), 2000); // UI Mock timer
    };

    return (
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto bg-gray-50/30 min-h-[calc(100vh-4rem)]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Regulatory Compliance</h1>
                    <p className="text-gray-500 mt-1">Central management for UDISE+, APAAR IDs, and DPDP Act Data Rights.</p>
                </div>
                <div className="text-right">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 px-3 py-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2 inline-block animate-pulse"></span>
                        System Compliant
                    </Badge>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-8">
                <TabsList className="grid w-full grid-cols-3 max-w-2xl bg-white shadow-sm border border-gray-100 p-1 rounded-xl h-14">
                    <TabsTrigger value="udise" className="rounded-lg font-semibold data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">UDISE+ Export</TabsTrigger>
                    <TabsTrigger value="apaar" className="rounded-lg font-semibold data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:shadow-sm">APAAR Management</TabsTrigger>
                    <TabsTrigger value="dpdp" className="rounded-lg font-semibold data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-sm">DPDPA 2023</TabsTrigger>
                </TabsList>

                {/* UDISE+ Tab */}
                <TabsContent value="udise" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="border-0 shadow-xl shadow-blue-900/5 bg-white overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-100 pb-8">
                            <CardTitle className="flex items-center gap-3 text-2xl text-blue-900">
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg></div>
                                Govt. UDISE+ Generation
                            </CardTitle>
                            <CardDescription className="text-blue-700/70 text-base mt-2">
                                Automatically compile all school, infrastructure, teacher, and student data down into the exact strict XML/CSV structure mandated by the Ministry of Education for porting to the UDISE+ platform.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                <Card className="p-5 border border-gray-100 hover:border-blue-200 transition-colors shadow-sm bg-gray-50/50">
                                    <div className="text-sm font-medium text-gray-500 mb-2">School Profile (Section 1)</div>
                                    <div className="text-2xl font-black text-gray-900 mb-2">100%</div>
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 shadow-none">Validated</Badge>
                                </Card>
                                <Card className="p-5 border border-gray-100 hover:border-blue-200 transition-colors shadow-sm bg-gray-50/50">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Student Rolls (Section 4)</div>
                                    <div className="text-2xl font-black text-gray-900 mb-2">1,245</div>
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 shadow-none">Synced & Clean</Badge>
                                </Card>
                                <Card className="p-5 border border-gray-100 hover:border-blue-200 transition-colors shadow-sm bg-gray-50/50">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Teacher Staff (Section 3)</div>
                                    <div className="text-2xl font-black text-gray-900 mb-2">67</div>
                                    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 shadow-none">2 Pending Aadhar</Badge>
                                </Card>
                                <Card className="p-5 border border-gray-100 hover:border-blue-200 transition-colors shadow-sm bg-gray-50/50">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Infrastructure (Section 2)</div>
                                    <div className="text-2xl font-black text-gray-900 mb-2">100%</div>
                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 shadow-none">Validated</Badge>
                                </Card>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
                                <Button onClick={handleUdiseExport} disabled={isExporting} className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 shadow-md transition-all font-semibold text-base">
                                    {isExporting ? (
                                        <div className="flex items-center gap-2"><svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Compiling Data Packet...</div>
                                    ) : (
                                        <div className="flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Download UDISE+ JSON Export</div>
                                    )}
                                </Button>
                                <Button variant="outline" className="h-12 px-8 font-semibold text-gray-700 bg-white hover:bg-gray-50 border-gray-200">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Run Pre-Flight Validation check
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* APAAR ID Tab */}
                <TabsContent value="apaar" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="border-0 shadow-xl shadow-purple-900/5 bg-white overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-purple-50 to-white border-b border-purple-100 pb-8">
                            <CardTitle className="flex items-center gap-3 text-2xl text-purple-900">
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg></div>
                                APAAR Integration
                            </CardTitle>
                            <CardDescription className="text-purple-700/70 text-base mt-2">
                                Ministry of Education (MoE) Automated Permanent Academic Account Registry. Push student data to automatically generate One Nation One Student IDs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                                <Card className="p-5 border-l-4 border-l-purple-500 shadow-sm bg-white">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Total Active Students</div>
                                    <div className="text-3xl font-black text-gray-900">1,245</div>
                                </Card>
                                <Card className="p-5 border-l-4 border-l-green-500 shadow-sm bg-white">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Successfully Linked</div>
                                    <div className="text-3xl font-black text-green-600 mb-1">892</div>
                                    <div className="text-xs text-green-700 font-semibold bg-green-50 inline-block px-2 py-1 rounded">71.6% Coverage</div>
                                </Card>
                                <Card className="p-5 border-l-4 border-l-amber-500 shadow-sm bg-white">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Pending MoE API Sync</div>
                                    <div className="text-3xl font-black text-amber-600">156</div>
                                </Card>
                                <Card className="p-5 border-l-4 border-l-red-500 shadow-sm bg-white">
                                    <div className="text-sm font-medium text-gray-500 mb-2">Missing KYC/Consent</div>
                                    <div className="text-3xl font-black text-red-600">197</div>
                                </Card>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
                                <Button className="bg-purple-600 hover:bg-purple-700 text-white h-12 px-8 shadow-md transition-all font-semibold text-base">
                                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> Push Batch to APAAR API
                                </Button>
                                <Button variant="outline" className="h-12 px-8 font-semibold text-gray-700 bg-white hover:bg-gray-50 border-gray-200">
                                    Send Mass Consent Request via SMS
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* DPDP Tab */}
                <TabsContent value="dpdp" className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                     <Card className="border-0 shadow-xl shadow-teal-900/5 bg-white overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-teal-50 to-white border-b border-teal-100 pb-8">
                            <CardTitle className="flex items-center gap-3 text-2xl text-teal-900">
                                <div className="p-2 bg-teal-100 rounded-lg text-teal-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                                Digital Personal Data Protection Act 2023
                            </CardTitle>
                            <CardDescription className="text-teal-700/70 text-base mt-2">
                                DPDPA Privacy Governance Console. Manage Data Principal rights requests, respond to parental inquiries, and track erasure timelines within the statutory 72 hours.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <Card className="p-5 bg-teal-50/50 border border-teal-100">
                                    <div className="text-sm font-medium text-teal-800 mb-2">Subject Access Requests</div>
                                    <div className="text-3xl font-black text-teal-900 mb-2">12</div>
                                    <Badge variant="outline" className="bg-white border-teal-200 text-teal-700 shadow-sm">This Month</Badge>
                                </Card>
                                <Card className="p-5 bg-orange-50/50 border border-orange-100">
                                    <div className="text-sm font-medium text-orange-800 mb-2">Data Erasure Requests</div>
                                    <div className="text-3xl font-black text-orange-900 mb-2">3</div>
                                    <Badge className="bg-orange-500 hover:bg-orange-600 shadow-sm">Pending Approval</Badge>
                                </Card>
                                <Card className="p-5 bg-gray-50/50 border border-gray-200">
                                    <div className="text-sm font-medium text-gray-600 mb-2">Correction Tickers</div>
                                    <div className="text-3xl font-black text-gray-900 mb-2">8</div>
                                    <Badge variant="outline" className="bg-white text-gray-500 shadow-sm">Completed</Badge>
                                </Card>
                                <Card className="p-5 bg-red-50/50 border border-red-100">
                                    <div className="text-sm font-medium text-red-800 mb-2">Govt Privacy Grievances</div>
                                    <div className="text-3xl font-black text-red-900 mb-2">0</div>
                                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 shadow-sm font-semibold">Zero Actionable Open</Badge>
                                </Card>
                            </div>

                            <div className="bg-gray-900 text-gray-300 p-6 rounded-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
                                <h4 className="font-semibold text-white mb-4 flex items-center gap-2"><svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> End-to-End System Rights Covered:</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-gray-800 p-3 rounded text-sm text-center border border-gray-700">Right to Access</div>
                                    <div className="bg-gray-800 p-3 rounded text-sm text-center border border-gray-700">Right to Correction</div>
                                    <div className="bg-gray-800 p-3 rounded text-sm text-center border border-gray-700">Right to Erasure</div>
                                    <div className="bg-gray-800 p-3 rounded text-sm text-center border border-gray-700">Right for Grievance</div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
                                <Button className="bg-teal-600 hover:bg-teal-700 text-white h-12 px-8 shadow-md transition-all font-semibold text-base">
                                    Action Pending DPDPA Requests
                                </Button>
                                <Button variant="outline" className="h-12 px-8 font-semibold text-gray-700 bg-white hover:bg-gray-50 border-gray-200">
                                    Privacy Impact Assessment (PIA)
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
