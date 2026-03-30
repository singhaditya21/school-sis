import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { stockAlerts, consumables } from '@/lib/db/schema';
import { eq, and, desc, lte } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { setTenantContext } from '@/lib/db';

interface PageProps {
    searchParams: Promise<{ filter?: string }>;
}

export default async function InventoryAlertsPage({ searchParams }: PageProps) {
    const { tenantId } = await requireAuth('inventory:read');
    await setTenantContext(tenantId);
    
    // Unroll search parameters
    const params = await searchParams;
    const filter = params.filter || 'ALL';

    // Fetch alerts joined with item names
    const rawAlerts = await db
        .select({
            id: stockAlerts.id,
            itemId: stockAlerts.itemId,
            itemName: consumables.name,
            type: stockAlerts.alertType,
            severity: stockAlerts.severity,
            message: stockAlerts.message,
            createdAt: stockAlerts.createdAt,
        })
        .from(stockAlerts)
        .leftJoin(consumables, eq(stockAlerts.itemId, consumables.id))
        .where(
            and(
                eq(stockAlerts.tenantId, tenantId),
                eq(stockAlerts.isResolved, false)
            )
        )
        .orderBy(desc(stockAlerts.createdAt));

    const alerts = rawAlerts.map(a => ({
        ...a,
        severity: (a.severity || 'INFO').toLowerCase() as 'critical' | 'warning' | 'info'
    }));

    const filteredAlerts = alerts.filter(a => filter === 'ALL' || a.severity === filter);

    const getSeverityBadge = (severity: string) => {
        const config: Record<string, { color: string; icon: string }> = {
            critical: { color: 'bg-red-500 text-white', icon: '🚨' },
            warning: { color: 'bg-orange-500 text-white', icon: '⚠️' },
            info: { color: 'bg-blue-100 text-blue-700', icon: 'ℹ️' },
        };
        const active = config[severity] || config.info;
        return <Badge className={active.color}>{active.icon} {severity.toUpperCase()}</Badge>;
    };

    const getTypeBadge = (type: string) => {
        const labels: Record<string, string> = { LOW_STOCK: 'Low Stock', OUT_OF_STOCK: 'Out of Stock', EXPIRING_SOON: 'Expiring Soon', MAINTENANCE_DUE: 'Maintenance Due' };
        return <Badge variant="outline">{labels[type] || type}</Badge>;
    };

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const infoCount = alerts.filter(a => a.severity === 'info').length;

    // Fetch items that need reordering
    // Unfortunately drizzle `lte` doesn't natively compare two columns inline without `sql` fragment. 
    // We can just fetch them all and array filter for simplicity, or use SQL fragment.
    const { sql } = await import('drizzle-orm');
    const reorderItems = await db
        .select()
        .from(consumables)
        .where(
            and(
                eq(consumables.tenantId, tenantId),
                sql`${consumables.currentStock} <= ${consumables.reorderLevel}`
            )
        );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Inventory Alerts</h1><p className="text-gray-600 mt-1">Stock alerts and reorder suggestions</p></div>
                <Link href="/inventory" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Inventory</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Link href="?filter=critical">
                    <Card className="cursor-pointer border-2 border-red-200 hover:bg-red-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Critical</div><div className="text-3xl font-bold text-red-600">{criticalCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=warning">
                    <Card className="cursor-pointer border-2 border-orange-200 hover:bg-orange-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Warning</div><div className="text-3xl font-bold text-orange-600">{warningCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=info">
                    <Card className="cursor-pointer border-2 border-blue-200 hover:bg-blue-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Info</div><div className="text-3xl font-bold text-blue-600">{infoCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=ALL">
                    <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Total</div><div className="text-3xl font-bold text-purple-600">{alerts.length}</div></CardContent>
                    </Card>
                </Link>
            </div>

            <Card>
                <CardHeader><CardTitle>Active Alerts {filter !== 'ALL' && `(${filter.toUpperCase()})`}</CardTitle></CardHeader>
                <CardContent>
                    {filteredAlerts.length === 0 ? <div className="text-center py-8 text-gray-500">✅ No alerts</div> : (
                        <div className="space-y-3">
                            {filteredAlerts.map(alert => (
                                <div key={alert.id} className={`p-4 rounded-lg border-l-4 ${alert.severity === 'critical' ? 'bg-red-50 border-red-500' : alert.severity === 'warning' ? 'bg-orange-50 border-orange-500' : 'bg-blue-50 border-blue-500'}`}>
                                    <div className="flex items-center justify-between"><div className="flex items-center gap-3">{getSeverityBadge(alert.severity)}{getTypeBadge(alert.type || '')}</div></div>
                                    <p className="mt-2 font-medium">{alert.itemName || 'Unknown Item'}</p>
                                    <p className="text-sm text-gray-600">{alert.message}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>📋 Reorder Suggestions</CardTitle></CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reorder</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Suggested</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reorderItems.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-4 text-center text-gray-500">No items need reordering.</td>
                                </tr>
                            ) : (
                                reorderItems.map(item => {
                                    const suggestedQty = Math.max((item.reorderLevel || 0) * 2 - (item.currentStock || 0), item.minimumStock || 0);
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium">{item.name}</td>
                                            <td className="px-4 py-3 text-right text-red-600 font-semibold">{item.currentStock} {item.unit}</td>
                                            <td className="px-4 py-3 text-right text-gray-500">{item.reorderLevel} {item.unit}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-blue-600">{suggestedQty} {item.unit}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
