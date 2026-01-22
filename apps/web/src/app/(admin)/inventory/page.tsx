'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    mockAssets,
    mockConsumables,
    getInventoryStats,
    type Asset,
    type Consumable
} from '@/lib/services/inventory/inventory.service';

const assetCategories = [
    { value: 'ALL', label: 'All', icon: '📦' },
    { value: 'FURNITURE', label: 'Furniture', icon: '🪑' },
    { value: 'IT_EQUIPMENT', label: 'IT Equipment', icon: '💻' },
    { value: 'LAB_EQUIPMENT', label: 'Lab', icon: '🔬' },
    { value: 'SPORTS', label: 'Sports', icon: '⚽' },
    { value: 'AUDIO_VISUAL', label: 'A/V', icon: '📺' },
];

const consumableCategories = [
    { value: 'ALL', label: 'All', icon: '📦' },
    { value: 'STATIONERY', label: 'Stationery', icon: '✏️' },
    { value: 'CLEANING', label: 'Cleaning', icon: '🧹' },
    { value: 'FIRST_AID', label: 'First Aid', icon: '🩹' },
    { value: 'LAB_SUPPLIES', label: 'Lab', icon: '🧪' },
    { value: 'SPORTS', label: 'Sports', icon: '🏀' },
];

export default function InventoryPage() {
    const [assetFilter, setAssetFilter] = useState('ALL');
    const [consumableFilter, setConsumableFilter] = useState('ALL');
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const stats = getInventoryStats();

    const filteredAssets = mockAssets.filter(a =>
        assetFilter === 'ALL' || a.category === assetFilter
    );

    const filteredConsumables = mockConsumables.filter(c =>
        consumableFilter === 'ALL' || c.category === consumableFilter
    );

    const getConditionBadge = (condition: Asset['condition']) => {
        const colors: Record<string, string> = {
            EXCELLENT: 'bg-green-100 text-green-700',
            GOOD: 'bg-blue-100 text-blue-700',
            FAIR: 'bg-yellow-100 text-yellow-700',
            NEEDS_REPAIR: 'bg-red-100 text-red-700',
            DISPOSED: 'bg-gray-100 text-gray-700',
        };
        return <Badge className={colors[condition]}>{condition.replace('_', ' ')}</Badge>;
    };

    const getStockBadge = (current: number, minimum: number) => {
        if (current <= 0) return <Badge className="bg-red-500 text-white">Out of Stock</Badge>;
        if (current <= minimum) return <Badge className="bg-orange-500 text-white">Low Stock</Badge>;
        return <Badge className="bg-green-100 text-green-700">In Stock</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Inventory Management</h1>
                    <p className="text-gray-600 mt-1">Track assets and consumables</p>
                </div>
                <Link href="/inventory/alerts" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                    🔔 Alerts ({stats.criticalAlerts + stats.warningAlerts})
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Assets</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.totalAssets}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Assets Value</div>
                        <div className="text-2xl font-bold text-green-600">₹{(stats.assetsValue / 100000).toFixed(1)}L</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Need Repair</div>
                        <div className="text-2xl font-bold text-orange-600">{stats.assetsNeedingRepair}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Consumables</div>
                        <div className="text-2xl font-bold text-purple-600">{stats.totalConsumables}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Low Stock Items</div>
                        <div className="text-2xl font-bold text-red-600">{stats.lowStockItems}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Active Alerts</div>
                        <div className="text-2xl font-bold text-yellow-600">{stats.criticalAlerts + stats.warningAlerts}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="assets">
                <TabsList>
                    <TabsTrigger value="assets">📦 Assets ({mockAssets.length})</TabsTrigger>
                    <TabsTrigger value="consumables">🧴 Consumables ({mockConsumables.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="assets" className="space-y-4">
                    {/* Asset Filters */}
                    <div className="flex gap-2 flex-wrap">
                        {assetCategories.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setAssetFilter(cat.value)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium ${assetFilter === cat.value ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                                    }`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Assets Table */}
                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial #</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAssets.map(asset => (
                                        <tr
                                            key={asset.id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => setSelectedAsset(asset)}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{asset.name}</div>
                                                <div className="text-xs text-gray-500">{asset.category}</div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-sm">{asset.serialNumber}</td>
                                            <td className="px-4 py-3">{asset.location}</td>
                                            <td className="px-4 py-3 text-right">₹{asset.purchasePrice.toLocaleString()}</td>
                                            <td className="px-4 py-3">{getConditionBadge(asset.condition)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="consumables" className="space-y-4">
                    {/* Consumable Filters */}
                    <div className="flex gap-2 flex-wrap">
                        {consumableCategories.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setConsumableFilter(cat.value)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium ${consumableFilter === cat.value ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
                                    }`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Consumables Table */}
                    <Card>
                        <CardContent className="p-0">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Min Stock</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredConsumables.map(item => (
                                        <tr
                                            key={item.id}
                                            className={`hover:bg-gray-50 ${item.currentStock <= item.minimumStock ? 'bg-orange-50' : ''}`}
                                        >
                                            <td className="px-4 py-3 font-medium">{item.name}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant="outline">{item.category}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                                {item.currentStock} {item.unit}
                                            </td>
                                            <td className="px-4 py-3 text-right text-gray-500">
                                                {item.minimumStock} {item.unit}
                                            </td>
                                            <td className="px-4 py-3 text-right">₹{item.unitPrice}</td>
                                            <td className="px-4 py-3">{getStockBadge(item.currentStock, item.minimumStock)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Asset Detail Dialog */}
            <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Asset Details</DialogTitle>
                    </DialogHeader>
                    {selectedAsset && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">Name:</span><br /><span className="font-medium">{selectedAsset.name}</span></div>
                                <div><span className="text-gray-500">Serial #:</span><br /><span className="font-mono">{selectedAsset.serialNumber}</span></div>
                                <div><span className="text-gray-500">Category:</span><br />{selectedAsset.category}</div>
                                <div><span className="text-gray-500">Condition:</span><br />{getConditionBadge(selectedAsset.condition)}</div>
                                <div><span className="text-gray-500">Location:</span><br />{selectedAsset.location}</div>
                                <div><span className="text-gray-500">Purchase Value:</span><br />₹{selectedAsset.purchasePrice.toLocaleString()}</div>
                                <div><span className="text-gray-500">Purchase Date:</span><br />{new Date(selectedAsset.purchaseDate).toLocaleDateString('en-IN')}</div>
                                <div><span className="text-gray-500">Vendor:</span><br />{selectedAsset.vendor}</div>
                                {selectedAsset.warrantyExpiry && (
                                    <div><span className="text-gray-500">Warranty Until:</span><br />{new Date(selectedAsset.warrantyExpiry).toLocaleDateString('en-IN')}</div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
