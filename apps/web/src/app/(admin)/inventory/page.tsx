import { Card, CardContent } from '@/components/ui/card';
import { getAssets, getConsumables, getInventoryStats, updateAssetConditionForm, restockConsumableForm } from '@/lib/actions/inventory';

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
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Assets</div><div className="text-2xl font-bold text-blue-600" data-testid="kpi-total-assets">{stats.totalAssets}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Asset Value</div><div className="text-2xl font-bold text-green-600" data-testid="kpi-asset-value">₹{(stats.totalAssetValue / 100000).toFixed(1)}L</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Low Stock Items</div><div className="text-2xl font-bold text-orange-600" data-testid="kpi-low-stock">{stats.lowStockItems}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Active Alerts</div><div className="text-2xl font-bold text-red-600" data-testid="kpi-active-alerts">{stats.activeAlerts}</div></CardContent></Card>
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {assetList.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50" data-testid={`asset-row-${a.id}`}>
                                    <td className="px-4 py-3"><div className="font-medium" data-testid={`asset-name-${a.id}`}>{a.name}</div>{a.serialNumber && <div className="text-xs text-gray-500" data-testid={`asset-serial-${a.id}`}>{a.serialNumber}</div>}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100" data-testid={`asset-category-${a.id}`}>{a.category}</span></td>
                                    <td className="px-4 py-3 text-sm" data-testid={`asset-location-${a.id}`}>{a.location || '—'}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${conditionColor(a.condition)}`} data-testid={`asset-condition-${a.id}`}>{a.condition}</span></td>
                                    <td className="px-4 py-3 text-right" data-testid={`asset-price-${a.id}`}>₹{Number(a.purchasePrice || 0).toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3">
                                        <form action={updateAssetConditionForm} className="flex items-center gap-2">
                                            <input type="hidden" name="assetId" value={a.id} />
                                            <select
                                                name="condition"
                                                defaultValue={a.condition}
                                                className="text-xs border rounded p-1"
                                                data-testid={`asset-condition-select-${a.id}`}
                                            >
                                                <option value="EXCELLENT">EXCELLENT</option>
                                                <option value="GOOD">GOOD</option>
                                                <option value="FAIR">FAIR</option>
                                                <option value="NEEDS_REPAIR">NEEDS_REPAIR</option>
                                                <option value="DISPOSED">DISPOSED</option>
                                                <option value="UNKNOWN">UNKNOWN</option>
                                            </select>
                                            <button
                                                type="submit"
                                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 font-medium"
                                                data-testid={`asset-condition-submit-${a.id}`}
                                            >
                                                Update
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                            {assetList.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No assets yet.</td></tr>}
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {consumableList.map(c => (
                                <tr key={c.id} className={`hover:bg-gray-50 ${c.currentStock <= c.minimumStock ? 'bg-red-50' : ''}`} data-testid={`consumable-row-${c.id}`}>
                                    <td className="px-4 py-3 font-medium" data-testid={`consumable-name-${c.id}`}>{c.name}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100" data-testid={`consumable-category-${c.id}`}>{c.category}</span></td>
                                    <td className="px-4 py-3 text-center"><span className={`font-semibold ${c.currentStock <= c.minimumStock ? 'text-red-600' : 'text-green-600'}`} data-testid={`consumable-stock-${c.id}`}>{c.currentStock} {c.unit}</span></td>
                                    <td className="px-4 py-3 text-center text-gray-500" data-testid={`consumable-min-${c.id}`}>{c.minimumStock}</td>
                                    <td className="px-4 py-3 text-sm" data-testid={`consumable-supplier-${c.id}`}>{c.supplier || '—'}</td>
                                    <td className="px-4 py-3">
                                        <form action={restockConsumableForm} className="flex items-center gap-2">
                                            <input type="hidden" name="consumableId" value={c.id} />
                                            <input
                                                type="number"
                                                name="quantity"
                                                min="1"
                                                defaultValue="10"
                                                className="w-16 px-1 py-1 border rounded text-xs"
                                                data-testid={`consumable-restock-qty-${c.id}`}
                                            />
                                            <button
                                                type="submit"
                                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 font-medium"
                                                data-testid={`consumable-restock-submit-${c.id}`}
                                            >
                                                Restock
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                            {consumableList.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No consumables yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}

