import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pool, } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

interface PageProps {
    searchParams: Promise<{ filter?: string }>;
}

export default async function InventoryAlertsPage({ searchParams }: PageProps) {
    const { tenantId } = await requireAuth('inventory:read');
    await (tenantId);
    
    // Unroll search parameters
    const params = await searchParams;
    const filter = params.filter || 'ALL';

    // Fetch alerts joined with item names
    const rawAlertsRes = await pool.query(`
        SELECT 
            sa.id, 
            sa.item_id AS "itemId", 
            COALESCE(c.name, a.name) AS "itemName", 
            sa.alert_type AS "type", 
            sa.severity, 
            sa.message, 
            sa.created_at AS "createdAt"
        FROM stock_alerts sa
        LEFT JOIN consumables c ON sa.item_id = c.id AND sa.item_type = 'CONSUMABLE'
        LEFT JOIN assets a ON sa.item_id = a.id AND sa.item_type = 'ASSET'
        WHERE sa.tenant_id = $1 AND sa.is_resolved = false
        ORDER BY sa.created_at DESC
    `, [tenantId]);
    const rawAlerts = rawAlertsRes.rows;

    const alerts = rawAlerts.map(a => ({
        ...a,
        severity: (a.severity || 'INFO').toLowerCase() as 'critical' | 'warning' | 'info'
    }));

    const filteredAlerts = alerts.filter(a => filter === 'ALL' || a.severity === filter);

    const getSeverityBadge = (severity: string, id: string) => {
        const config: Record<string, { color: string; icon: string }> = {
            critical: { color: 'bg-red-500 text-white', icon: '🚨' },
            warning: { color: 'bg-orange-500 text-white', icon: '⚠️' },
            info: { color: 'bg-blue-100 text-blue-700', icon: 'ℹ️' },
        };
        const active = config[severity] || config.info;
        return <Badge className={active.color} data-testid={`alert-severity-${id}`}>{active.icon} {severity.toUpperCase()}</Badge>;
    };

    const getTypeBadge = (type: string) => {
        const labels: Record<string, string> = { LOW_STOCK: 'Low Stock', OUT_OF_STOCK: 'Out of Stock', EXPIRING_SOON: 'Expiring Soon', MAINTENANCE_DUE: 'Maintenance Due' };
        return <Badge variant="outline">{labels[type] || type}</Badge>;
    };

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const infoCount = alerts.filter(a => a.severity === 'info').length;

    // Fetch items that need reordering
    const reorderItemsRes = await pool.query(`
        SELECT id, name, current_stock AS "currentStock", reorder_level AS "reorderLevel", minimum_stock AS "minimumStock", unit
        FROM consumables
        WHERE tenant_id = $1 AND current_stock <= reorder_level
    `, [tenantId]);
    const reorderItems = reorderItemsRes.rows;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Inventory Alerts</h1><p className="text-gray-600 mt-1">Stock alerts and reorder suggestions</p></div>
                <Link href="/inventory" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Inventory</Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Link href="?filter=critical" data-testid="filter-critical">
                    <Card className="cursor-pointer border-2 border-red-200 hover:bg-red-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Critical</div><div className="text-3xl font-bold text-red-600" data-testid="kpi-critical-count">{criticalCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=warning" data-testid="filter-warning">
                    <Card className="cursor-pointer border-2 border-orange-200 hover:bg-orange-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Warning</div><div className="text-3xl font-bold text-orange-600" data-testid="kpi-warning-count">{warningCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=info" data-testid="filter-info">
                    <Card className="cursor-pointer border-2 border-blue-200 hover:bg-blue-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Info</div><div className="text-3xl font-bold text-blue-600" data-testid="kpi-info-count">{infoCount}</div></CardContent>
                    </Card>
                </Link>
                <Link href="?filter=ALL" data-testid="filter-all">
                    <Card className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <CardContent className="pt-4"><div className="text-sm text-gray-500">Total</div><div className="text-3xl font-bold text-purple-600" data-testid="kpi-total-alerts">{alerts.length}</div></CardContent>
                    </Card>
                </Link>
            </div>

            <Card>
                <CardHeader><CardTitle>Active Alerts {filter !== 'ALL' && `(${filter.toUpperCase()})`}</CardTitle></CardHeader>
                <CardContent>
                    {filteredAlerts.length === 0 ? <div className="text-center py-8 text-gray-500" data-testid="no-alerts-placeholder">✅ No alerts</div> : (
                        <div className="space-y-3" data-testid="active-alerts-list">
                            {filteredAlerts.map(alert => (
                                <div key={alert.id} data-testid="alert-item" className={`p-4 rounded-lg border-l-4 ${alert.severity === 'critical' ? 'bg-red-50 border-red-500' : alert.severity === 'warning' ? 'bg-orange-50 border-orange-500' : 'bg-blue-50 border-blue-500'}`}>
                                    <div className="flex items-center justify-between"><div className="flex items-center gap-3">{getSeverityBadge(alert.severity, alert.id)}{getTypeBadge(alert.type || '')}</div></div>
                                    <p className="mt-2 font-medium" data-testid={`alert-name-${alert.id}`}>{alert.itemName || 'Unknown Item'}</p>
                                    <p className="text-sm text-gray-600" data-testid={`alert-message-${alert.id}`}>{alert.message}</p>
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
                        <tbody className="divide-y" data-testid="reorder-suggestions-list">
                            {reorderItems.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-4 text-center text-gray-500" data-testid="no-suggestions-placeholder">No items need reordering.</td>
                                </tr>
                            ) : (
                                reorderItems.map(item => {
                                    const suggestedQty = Math.max((item.reorderLevel || 0) * 2 - (item.currentStock || 0), item.minimumStock || 0);
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50" data-testid={`reorder-row-${item.id}`}>
                                            <td className="px-4 py-3 font-medium" data-testid={`reorder-item-name-${item.id}`}>{item.name}</td>
                                            <td className="px-4 py-3 text-right text-red-600 font-semibold" data-testid={`reorder-current-stock-${item.id}`}>{item.currentStock} {item.unit}</td>
                                            <td className="px-4 py-3 text-right text-gray-500" data-testid={`reorder-level-${item.id}`}>{item.reorderLevel} {item.unit}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-blue-600" data-testid={`reorder-suggested-qty-${item.id}`}>{suggestedQty} {item.unit}</td>
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
