'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    FileText,
    Download,
    CheckCircle2,
    AlertCircle,
    Upload,
    RefreshCw,
    Shield,
    Database,
    User
} from 'lucide-react';

export default function CompliancePage() {
    const [activeTab, setActiveTab] = useState('udise');
    const [isExporting, setIsExporting] = useState(false);

    const handleUdiseExport = async () => {
        setIsExporting(true);
        try {
            const response = await fetch('/api/compliance/udise/export');
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'udise_export_2025-26.json';
                a.click();
            }
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Regulatory Compliance</h1>
                    <p className="text-muted-foreground">Manage UDISE+, APAAR, and DPDP compliance</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="udise">UDISE+ Export</TabsTrigger>
                    <TabsTrigger value="apaar">APAAR ID</TabsTrigger>
                    <TabsTrigger value="dpdp">DPDP Rights</TabsTrigger>
                </TabsList>

                {/* UDISE+ Tab */}
                <TabsContent value="udise" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5" />
                                UDISE+ Data Export
                            </CardTitle>
                            <CardDescription>
                                Generate and download school data in UDISE+ format for regulatory submission
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">School Profile</div>
                                    <div className="text-2xl font-bold">Complete</div>
                                    <Badge variant="default" className="mt-2">Ready</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Student Enrollment</div>
                                    <div className="text-2xl font-bold">1,245</div>
                                    <Badge variant="default" className="mt-2">Synced</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Teacher Data</div>
                                    <div className="text-2xl font-bold">67</div>
                                    <Badge variant="default" className="mt-2">Ready</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Infrastructure</div>
                                    <div className="text-2xl font-bold">Complete</div>
                                    <Badge variant="default" className="mt-2">Ready</Badge>
                                </Card>
                            </div>

                            <div className="flex gap-2">
                                <Button onClick={handleUdiseExport} disabled={isExporting}>
                                    {isExporting ? (
                                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4 mr-2" />
                                    )}
                                    Export UDISE+ Data
                                </Button>
                                <Button variant="outline">
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Validate Data
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* APAAR ID Tab */}
                <TabsContent value="apaar" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                APAAR ID Management
                            </CardTitle>
                            <CardDescription>
                                Request and manage Automated Permanent Academic Account Registry IDs for students
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Total Students</div>
                                    <div className="text-2xl font-bold">1,245</div>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">APAAR Linked</div>
                                    <div className="text-2xl font-bold text-green-600">892</div>
                                    <Badge variant="default" className="mt-2">72%</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Pending Requests</div>
                                    <div className="text-2xl font-bold text-amber-600">156</div>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Not Requested</div>
                                    <div className="text-2xl font-bold text-gray-500">197</div>
                                </Card>
                            </div>

                            <div className="flex gap-2">
                                <Button>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Bulk Request APAAR IDs
                                </Button>
                                <Button variant="outline">
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Sync Status
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* DPDP Tab */}
                <TabsContent value="dpdp" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                DPDP Compliance Dashboard
                            </CardTitle>
                            <CardDescription>
                                Manage data subject rights under Digital Personal Data Protection Act 2023
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Access Requests</div>
                                    <div className="text-2xl font-bold">12</div>
                                    <Badge variant="outline" className="mt-2">This Month</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Deletion Requests</div>
                                    <div className="text-2xl font-bold">3</div>
                                    <Badge variant="outline" className="mt-2">Pending</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Corrections</div>
                                    <div className="text-2xl font-bold">8</div>
                                    <Badge variant="default" className="mt-2">Completed</Badge>
                                </Card>
                                <Card className="p-4">
                                    <div className="text-sm text-muted-foreground">Grievances</div>
                                    <div className="text-2xl font-bold">0</div>
                                    <Badge variant="default" className="mt-2">Open</Badge>
                                </Card>
                            </div>

                            <div className="bg-muted p-4 rounded-lg">
                                <h4 className="font-semibold mb-2">Data Rights Supported</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <Badge variant="secondary">Right to Access</Badge>
                                    <Badge variant="secondary">Right to Correction</Badge>
                                    <Badge variant="secondary">Right to Erasure</Badge>
                                    <Badge variant="secondary">Right to Portability</Badge>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button>
                                    <FileText className="h-4 w-4 mr-2" />
                                    View All Requests
                                </Button>
                                <Button variant="outline">
                                    <AlertCircle className="h-4 w-4 mr-2" />
                                    Privacy Settings
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
