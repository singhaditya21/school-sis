import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarCheck2, FileText, GraduationCap, WalletCards } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getParentOverview } from '@/lib/services/parent/parent.service';
import { getSession } from '@/lib/auth/session';
import { evaluateCapability } from '@/lib/capabilities/evaluator';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function ParentOverviewPage() {
    const session = await getSession();
    if (!session.isLoggedIn || session.role !== 'PARENT') {
        redirect('/login');
    }

    const paymentsAvailable = evaluateCapability('payments', {
        activeModules: session.activeModules || [],
        institutionType: session.institutionType,
        hasPermission: (permission) => hasPermission(session.role as UserRole, permission),
    }).available;

    let data;
    try {
        data = await getParentOverview();
    } catch {
        redirect('/login');
    }

    const studentDisplay = data.students.length > 0
        ? data.students[0]
        : { name: 'No student linked', class: '' };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Welcome, Parent</h1>
                <p className="text-muted-foreground mt-1">
                    Here&apos;s an overview of your child&apos;s information
                </p>
            </div>

            <div className={`grid grid-cols-1 gap-6 ${paymentsAvailable ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                <Card>
                    <CardHeader className="pb-2">
                        <GraduationCap className="size-5 text-primary" aria-hidden="true" />
                        <CardDescription>Student information</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xl font-bold">{studentDisplay.name}</p>
                        <p className="text-sm text-muted-foreground">{studentDisplay.class || 'Class not provided'}</p>
                    {data.students.length > 1 && (
                            <p className="mt-2 text-xs text-primary">+{data.students.length - 1} more</p>
                    )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CalendarCheck2 className="size-5 text-success" aria-hidden="true" />
                        <CardDescription>Attendance this month</CardDescription>
                    </CardHeader>
                    <CardContent className="text-3xl font-bold text-success">{data.attendanceRate}%</CardContent>
                </Card>

                {paymentsAvailable ? (
                    <Card className="border-warning/30 bg-warning-muted">
                        <CardHeader className="pb-2">
                            <WalletCards className="size-5 text-warning" aria-hidden="true" />
                            <CardDescription className="text-warning">Pending fees</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-warning">{formatCurrency(data.pendingFees.totalAmount)}</p>
                            <p className="text-sm text-warning">
                            {data.pendingFees.nearestDueDate
                                ? `Due by ${data.pendingFees.nearestDueDate}`
                                : 'No pending fees'}
                            </p>
                        </CardContent>
                    </Card>
                ) : null}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {paymentsAvailable ? (
                    <Link href="/my-fees" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Card className="h-full transition-shadow hover:shadow-md">
                            <CardHeader className="items-center text-center">
                                <WalletCards className="size-6 text-primary" aria-hidden="true" />
                                <CardTitle className="text-base">My Fees</CardTitle>
                            </CardHeader>
                        </Card>
                    </Link>
                ) : null}
                <Link href="/my-attendance" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="h-full transition-shadow hover:shadow-md">
                        <CardHeader className="items-center text-center">
                            <CalendarCheck2 className="size-6 text-primary" aria-hidden="true" />
                            <CardTitle className="text-base">Attendance</CardTitle>
                        </CardHeader>
                    </Card>
                </Link>
                <Link href="/my-results" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="h-full transition-shadow hover:shadow-md">
                        <CardHeader className="items-center text-center">
                            <FileText className="size-6 text-primary" aria-hidden="true" />
                            <CardTitle className="text-base">Report Cards</CardTitle>
                        </CardHeader>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
