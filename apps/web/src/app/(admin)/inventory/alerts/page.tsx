'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    generateStockAlerts,
    mockConsumables,
    type StockAlert
} from '@/lib/services/inventory/inventory.service';

export default function InventoryAlertsPage() {
    const [filter, setFilter] = useState<'ALL' | 'critical' | 'warning' | 'info'>('ALL');
    const alerts = generateStockAlerts();

    const filteredAlerts = alerts.filter(a =>
        filter === 'ALL' || a.severity === filter
    );

    const getSeverityBadge = (severity: StockAlert['severity']) => {
        const config: Record<string, { color: string; icon: string }> = {
            critical: { color: 'bg-red-500 text-white', icon: '🚨' },
            warning: { color: 'bg-orange-500 text-white', icon: '⚠️' },
            info: { color: 'bg-blue-100 text-blue-700', icon: 'ℹ️' },
        };
        return <Badge className={config[severity].color}>{config[severity].icon} {severity.toUpperCase()}</Badge>;
    };

    const getTypeBadge = (type: StockAlert['type']) => {
        const labels: Record<string, string> = {
            LOW_STOCK: 'Low Stock',
            OUT_OF_STOCK: 'Out of Stock',
            EXPIRING_SOON: 'Expiring Soon',
            MAINTENANCE_DUE: 'Maintenance Due',
        };
        return <Badge variant="outline">{labels[type]}</Badge>;
    };

    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount = alerts.filter(a => a.severity === 'warning').length;
    const infoCount = alerts.filter(a => a.severity === 'info').length;

    // Get items that need reordering
    const reorderItems = mockConsumables.filter(c => c.currentStock <= c.reorderLevel);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Inventory Alerts</h1>
                    <p className="text-gray-600 mt-1">Stock alerts and reorder suggestions</p>
                </div>
                <Link href="/inventory" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    ← Back to Inventory
                </Link>
            </div>

            {/* Alert Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="cursor-pointer border-2 border-red-200" onClick={() => setFilter('critical')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Critical</div>
                        <div className="text-3xl font-bold text-red-600">{criticalCount}</div>
                        <div className="text-xs text-red-500">Requires immediate action</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer border-2 border-orange-200" onClick={() => setFilter('warning')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Warning</div>
                        <div className="text-3xl font-bold text-orange-600">{warningCount}</div>
                        <div className="text-xs text-orange-500">Action needed soon</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer border-2 border-blue-200" onClick={() => setFilter('info')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Info</div>
                        <div className="text-3xl font-bold text-blue-600">{infoCount}</div>
                        <div className="text-xs text-blue-500">For your awareness</div>
                    </CardContent>
                </Card>
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Alerts</div>
                        <div className="text-3xl font-bold text-purple-600">{alerts.length}</div>
                        <div className="text-xs text-gray-500">Click to show all</div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts List */}
            <Card>
                <CardHeader>
                    <CardTitle>Active Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredAlerts.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            ✅ No alerts in this category
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredAlerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className={`p-4 rounded-lg border-l-4 ${alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
                                            alert.severity === 'warning' ? 'bg-orange-50 border-orange-500' :
                                                'bg-blue-50 border-blue-500'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {getSeverityBadge(alert.severity)}
                                            {getTypeBadge(alert.type)}
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {new Date(alert.createdAt).toLocaleTimeString('en-IN')}
                                        </span>
                                    </div>
                                    <p className="mt-2 font-medium">{alert.itemName}</p>
                                    <p className="text-sm text-gray-600">{alert.message}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reorder Suggestions */}
            <Card>
                <CardHeader>
                    <CardTitle>📋 Reorder Suggestions</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reorder Level</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Suggested Order</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Est. Cost</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {reorderItems.map(item => {
                                const suggestedQty = Math.max(item.reorderLevel * 2 - item.currentStock, item.minimumStock);
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{item.name}</td>
                                        <td className="px-4 py-3 text-right text-red-600 font-semibold">{item.currentStock} {item.unit}</td>
                                        <td className="px-4 py-3 text-right text-gray-500">{item.reorderLevel} {item.unit}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-blue-600">{suggestedQty} {item.unit}</td>
                                        <td className="px-4 py-3 text-right">₹{(suggestedQty * item.unitPrice).toLocaleString()}</td>
                                        <td className="px-4 py-3">{item.supplier}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
