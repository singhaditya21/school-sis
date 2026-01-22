import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export default async function ConsentManagementPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    // Mock consent data
    const consentItems = [
        {
            id: '1',
            type: 'Photo/Video',
            description: 'Permission to use student photos and videos in school publications',
            status: 'pending',
            pendingCount: 45,
            approvedCount: 280,
            totalStudents: 325
        },
        {
            id: '2',
            type: 'Field Trip',
            description: 'General consent for school-organized field trips and excursions',
            status: 'pending',
            pendingCount: 12,
            approvedCount: 313,
            totalStudents: 325
        },
        {
            id: '3',
            type: 'Medical Emergency',
            description: 'Authorization for emergency medical treatment if parents cannot be reached',
            status: 'approved',
            pendingCount: 0,
            approvedCount: 325,
            totalStudents: 325
        },
        {
            id: '4',
            type: 'Data Processing (DPDP)',
            description: 'Consent under Digital Personal Data Protection Act 2023',
            status: 'pending',
            pendingCount: 89,
            approvedCount: 236,
            totalStudents: 325
        }
    ];

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Consent & Audit</h1>
                    <p className="text-muted-foreground">
                        Guardian consent management and comprehensive audit logs
                    </p>
                </div>
                <Button>Request New Consent</Button>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600">325</div>
                        <div className="text-sm text-muted-foreground">Total Students</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-blue-600">92%</div>
                        <div className="text-sm text-muted-foreground">Overall Compliance</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-yellow-600">146</div>
                        <div className="text-sm text-muted-foreground">Pending Consents</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-red-600">0</div>
                        <div className="text-sm text-muted-foreground">Expired Consents</div>
                    </CardContent>
                </Card>
            </div>

            {/* Consent Items */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold">Consent Categories</h2>
                {consentItems.map(item => (
                    <Card key={item.id}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-semibold">{item.type}</h3>
                                        {item.status === 'approved' ? (
                                            <Badge className="bg-green-100 text-green-800">
                                                <CheckCircle className="h-3 w-3 mr-1" /> Complete
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-yellow-100 text-yellow-800">
                                                <Clock className="h-3 w-3 mr-1" /> {item.pendingCount} Pending
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-semibold">
                                        {Math.round((item.approvedCount / item.totalStudents) * 100)}%
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {item.approvedCount}/{item.totalStudents} approved
                                    </div>
                                </div>
                                <Button variant="outline" className="ml-4">View Details</Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Audit Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Audit Log</CardTitle>
                    <CardDescription>Track all consent-related activities</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b">
                            <span>DPDP consent collected - Aarav Sharma</span>
                            <span className="text-muted-foreground">2 hours ago</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                            <span>Photo consent reminder sent - 45 parents</span>
                            <span className="text-muted-foreground">5 hours ago</span>
                        </div>
                        <div className="flex justify-between py-2 border-b">
                            <span>Field trip consent collected - Priya Patel</span>
                            <span className="text-muted-foreground">1 day ago</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
