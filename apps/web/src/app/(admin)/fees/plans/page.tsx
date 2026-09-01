import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { getFeePlanSummaries } from '@/lib/actions/fee-plans';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function FeePlansPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const plans = await getFeePlanSummaries();

    // A plan can only produce invoices once it carries a mandatory component —
    // generateInvoices prices from mandatory components and refuses empty plans.
    const unusable = plans.filter((plan) => plan.mandatoryTotal <= 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link href="/fees" className="text-sm text-muted-foreground hover:underline">
                        ← Fee management
                    </Link>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight">Fee plans</h1>
                    <p className="text-muted-foreground">
                        Each plan bills its mandatory components to every student it is generated for.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/fees/plans/new">+ New fee plan</Link>
                </Button>
            </div>

            {unusable.length > 0 && (
                <Card className="border-amber-300 dark:border-amber-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-amber-700 dark:text-amber-400">
                            {unusable.length} plan{unusable.length === 1 ? '' : 's'} cannot be invoiced
                        </CardTitle>
                        <CardDescription>
                            A plan needs at least one mandatory component before invoices can be generated
                            from it. Open the plan and add one.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2 pt-2">
                        {unusable.map((plan) => (
                            <Link
                                key={plan.id}
                                href={`/fees/plans/${plan.id}/edit`}
                                className="text-sm text-primary underline-offset-4 hover:underline dark:text-primary"
                            >
                                {plan.name}
                            </Link>
                        ))}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-0">
                    {plans.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">
                            No fee plans yet. Create one to start invoicing.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Plan</TableHead>
                                        <TableHead>Academic year</TableHead>
                                        <TableHead className="text-right">Components</TableHead>
                                        <TableHead className="text-right">Billed per student</TableHead>
                                        <TableHead className="text-right">Optional extras</TableHead>
                                        <TableHead className="text-right">Invoices</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">&nbsp;</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {plans.map((plan) => (
                                        <TableRow key={plan.id} data-testid="fee-plan-row">
                                            <TableCell>
                                                <Link
                                                    href={`/fees/plans/${plan.id}/edit`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {plan.name}
                                                </Link>
                                                {plan.description && (
                                                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {plan.academicYearName}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {plan.componentCount}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">
                                                {formatCurrency(plan.mandatoryTotal)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">
                                                {plan.optionalTotal > 0 ? formatCurrency(plan.optionalTotal) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {plan.invoiceCount}
                                            </TableCell>
                                            <TableCell>
                                                {plan.mandatoryTotal <= 0 ? (
                                                    <Badge variant="destructive">Not invoiceable</Badge>
                                                ) : plan.isActive ? (
                                                    <Badge>Active</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Inactive</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Link
                                                    href={`/fees/plans/${plan.id}/edit`}
                                                    className="text-sm text-primary hover:underline dark:text-primary"
                                                >
                                                    Edit →
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
