import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import RescanButton from './rescan-button';

interface PageProps {
    searchParams: Promise<{ filter?: string }>;
}

type Severity = 'critical' | 'warning' | 'info';

const SEVERITY_CONFIG: Record<Severity, { color: string; icon: string }> = {
    critical: { color: 'bg-red-500 text-white', icon: '🚨' },
    warning: { color: 'bg-orange-500 text-white', icon: '⚠️' },
    info: { color: 'bg-blue-100 text-blue-700', icon: 'ℹ️' },
};

const TYPE_LABELS: Record<string, string> = {
    LOW_STOCK: 'Low Stock',
    OUT_OF_STOCK: 'Out of Stock',
    EXPIRING_SOON: 'Expiring Soon',
    MAINTENANCE_DUE: 'Maintenance Due',
};

function toSeverity(value: unknown): Severity {
    const lowered = String(value ?? 'INFO').toLowerCase();
    return lowered === 'critical' || lowered === 'warning' ? lowered : 'info';
}

export default async function InventoryAlertsPage({ searchParams }: PageProps) {
    const { tenantId } = await requireAuth('inventory:read');
    const session = await getSession();
    const canWrite = hasPermission(session.role as UserRole, 'inventory:write');

    const params = await searchParams;
    const filter = params.filter || 'ALL';

    const { rows: rawAlerts } = await pool.query(`
        SELECT
            sa.id,
            sa.item_id AS "itemId",
            COALESCE(c.name, a.name) AS "itemName",
            sa.alert_type::text AS "type",
            sa.severity::text AS severity,
            sa.message,
            sa.created_at AS "createdAt"
        FROM stock_alerts sa
        LEFT JOIN consumables c ON sa.item_id = c.id AND sa.item_type = 'CONSUMABLE' AND c.tenant_id = sa.tenant_id
        LEFT JOIN assets a ON sa.item_id = a.id AND sa.item_type = 'ASSET' AND a.tenant_id = sa.tenant_id
        WHERE sa.tenant_id = $1 AND sa.is_resolved = false
        ORDER BY sa.created_at DESC
    `, [tenantId]);

    const alerts = rawAlerts.map((a) => ({
        id: String(a.id),
        itemName: (a.itemName as string | null) ?? null,
        type: String(a.type ?? ''),
        message: String(a.message ?? ''),
        severity: toSeverity(a.severity),
    }));

    const filteredAlerts = alerts.filter((a) => filter === 'ALL' || a.severity === filter);

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const infoCount = alerts.filter(a => a.severity === 'info').length;

    const { rows: reorderItems } = await pool.query(`
        SELECT id, name, current_stock AS "currentStock", reorder_level AS "reorderLevel", minimum_stock AS "minimumStock", unit
        FROM consumables
        WHERE tenant_id = $1 AND current_stock <= reorder_level
        ORDER BY name ASC
    `, [tenantId]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div><h1 className="text-3xl font-bold">Inventory Alerts</h1><p className="text-gray-600 mt-1">Stock alerts and reorder suggestions</p></div>
                <div className="flex items-center gap-2">
                    {canWrite && <RescanButton />}
                    <Link href="/inventory" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Inventory</Link>
                </div>
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
                            {filteredAlerts.map(alert => {
                                const severityStyle = SEVERITY_CONFIG[alert.severity];
                                return (
                                    <div key={alert.id} data-testid="alert-item" className={`p-4 rounded-lg border-l-4 ${alert.severity === 'critical' ? 'bg-red-50 border-red-500' : alert.severity === 'warning' ? 'bg-orange-50 border-orange-500' : 'bg-blue-50 border-blue-500'}`}>
                                        <div className="flex items-center gap-3">
                                            <Badge className={severityStyle.color} data-testid={`alert-severity-${alert.id}`}>{severityStyle.icon} {alert.severity.toUpperCase()}</Badge>
                                            <Badge variant="outline">{TYPE_LABELS[alert.type] || alert.type}</Badge>
                                        </div>
                                        <p className="mt-2 font-medium" data-testid={`alert-name-${alert.id}`}>{alert.itemName || 'Unknown Item'}</p>
                                        <p className="text-sm text-gray-600" data-testid={`alert-message-${alert.id}`}>{alert.message}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Reorder Suggestions</CardTitle></CardHeader>
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
                    <p className="text-xs text-gray-500 mt-3">
                        Suggested quantity is twice the reorder level less what is on hand, floored at the minimum stock.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
