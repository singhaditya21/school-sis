import { Card, CardContent } from '@/components/ui/card';
import { getAssets, getConsumables, getInventoryStats } from '@/lib/actions/inventory';

export default async function InventoryPage() {
    const [assetList, consumableList, stats] = await Promise.all([
        getAssets(),
        getConsumables(),
        getInventoryStats(),
    ]);

    const conditionColor = (c: string) => {
        const m: Record<string, string> = { EXCELLENT: 'bg-green-100 text-green-700', GOOD: 'bg-blue-100 text-blue-700', FAIR: 'bg-yellow-100 text-yellow-700', NEEDS_REPAIR: 'bg-red-100 text-red-700', DISPOSED: 'bg-gray-100 text-gray-700' };
        return m[c] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Inventory Management</h1><p className="text-gray-600 mt-1">Track assets, consumables, and stock levels</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Assets</div><div className="text-2xl font-bold text-blue-600">{stats.totalAssets}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Asset Value</div><div className="text-2xl font-bold text-green-600">₹{(stats.totalAssetValue / 100000).toFixed(1)}L</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Low Stock Items</div><div className="text-2xl font-bold text-orange-600">{stats.lowStockItems}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Active Alerts</div><div className="text-2xl font-bold text-red-600">{stats.activeAlerts}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Assets ({assetList.length})</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {assetList.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3"><div className="font-medium">{a.name}</div>{a.serialNumber && <div className="text-xs text-gray-500">{a.serialNumber}</div>}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{a.category}</span></td>
                                    <td className="px-4 py-3 text-sm">{a.location || '—'}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${conditionColor(a.condition)}`}>{a.condition}</span></td>
                                    <td className="px-4 py-3 text-right">₹{Number(a.purchasePrice || 0).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                            {assetList.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No assets yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Consumables ({consumableList.length})</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Min</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {consumableList.map(c => (
                                <tr key={c.id} className={`hover:bg-gray-50 ${c.currentStock <= c.minimumStock ? 'bg-red-50' : ''}`}>
                                    <td className="px-4 py-3 font-medium">{c.name}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{c.category}</span></td>
                                    <td className="px-4 py-3 text-center"><span className={`font-semibold ${c.currentStock <= c.minimumStock ? 'text-red-600' : 'text-green-600'}`}>{c.currentStock} {c.unit}</span></td>
                                    <td className="px-4 py-3 text-center text-gray-500">{c.minimumStock}</td>
                                    <td className="px-4 py-3 text-sm">{c.supplier || '—'}</td>
                                </tr>
                            ))}
                            {consumableList.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No consumables yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
