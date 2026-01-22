import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getFeeIntelligence } from '@/lib/services/ai/fee-intelligence.service';
import Link from 'next/link';

export default async function FeeIntelligencePage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    // Get intelligence from Java API
    const summary = await getFeeIntelligence(session.token || '');

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(amount);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        🤖 AI Fee Intelligence
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Smart insights for fee collection optimization
                    </p>
                </div>
                <Badge variant="secondary" className="text-sm">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                    Live Analysis
                </Badge>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
                            💰 Total Collected
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(summary.totalCollected)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                            ⏳ Total Pending
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                            {formatCurrency(summary.totalPending)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
                            ⚠️ Total Overdue
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                            {formatCurrency(summary.totalOverdue)}
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                            📊 Collection Rate
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                            {summary.collectionRate}%
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Insights */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        💡 AI Insights
                    </CardTitle>
                    <CardDescription>
                        Actionable recommendations for improving collections
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {summary.insights.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p className="text-4xl mb-2">✨</p>
                            <p>No insights available yet. More data needed for analysis.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {summary.insights.map((insight, index) => (
                                <div
                                    key={index}
                                    className={`p-4 rounded-lg border ${insight.type === 'warning'
                                            ? 'bg-yellow-50 border-yellow-200'
                                            : insight.type === 'success'
                                                ? 'bg-green-50 border-green-200'
                                                : 'bg-blue-50 border-blue-200'
                                        }`}
                                >
                                    <h4 className="font-semibold">{insight.title}</h4>
                                    <p className="text-sm mt-1">{insight.message}</p>
                                    {insight.actionUrl && (
                                        <Link href={insight.actionUrl} className="text-blue-600 hover:underline text-sm mt-2 inline-block">
                                            Take Action →
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        ⚡ Quick Actions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                        <Button asChild className="w-full">
                            <Link href="/fees/defaulters">View Defaulters</Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/fees/cashflow">Cashflow Forecast</Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="/invoices">Manage Invoices</Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
