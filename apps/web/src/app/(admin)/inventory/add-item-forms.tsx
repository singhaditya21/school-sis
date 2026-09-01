'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createAsset, createConsumable } from './actions';

/** Mirrors the `asset_category` enum in the database. */
const ASSET_CATEGORIES = ['FURNITURE', 'IT_EQUIPMENT', 'SPORTS', 'LAB_EQUIPMENT', 'AUDIO_VISUAL', 'OTHER'] as const;
/** Mirrors the `asset_condition` enum in the database. */
const ASSET_CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DISPOSED'] as const;
/** Mirrors the `consumable_category` enum in the database. */
const CONSUMABLE_CATEGORIES = ['STATIONERY', 'CLEANING', 'SPORTS', 'LAB_SUPPLIES', 'FIRST_AID', 'OFFICE'] as const;

const FIELD = 'w-full p-2 border rounded text-sm bg-card';
const LABEL = 'block text-xs font-semibold text-muted-foreground mb-1';

const EMPTY_ASSET = {
    name: '',
    category: 'FURNITURE' as string,
    serialNumber: '',
    location: '',
    vendor: '',
    condition: 'GOOD' as string,
    purchaseDate: '',
    purchasePrice: '',
    warrantyExpiry: '',
};

const EMPTY_CONSUMABLE = {
    name: '',
    category: 'STATIONERY' as string,
    unit: '',
    currentStock: '0',
    minimumStock: '0',
    reorderLevel: '0',
    unitPrice: '',
    supplier: '',
};

export default function AddItemForms() {
    const router = useRouter();
    const [tab, setTab] = useState<'asset' | 'consumable'>('asset');
    const [asset, setAsset] = useState(EMPTY_ASSET);
    const [consumable, setConsumable] = useState(EMPTY_CONSUMABLE);
    const [isPending, startTransition] = useTransition();

    const setAssetField = (field: keyof typeof EMPTY_ASSET, value: string) =>
        setAsset((prev) => ({ ...prev, [field]: value }));
    const setConsumableField = (field: keyof typeof EMPTY_CONSUMABLE, value: string) =>
        setConsumable((prev) => ({ ...prev, [field]: value }));

    const submitAsset = () => {
        startTransition(async () => {
            const result = await createAsset(asset);
            if (!result.success) {
                toast.error(result.error ?? 'Could not register that asset.');
                return;
            }
            toast.success(`${asset.name.trim()} added to the asset register`);
            setAsset(EMPTY_ASSET);
            router.refresh();
        });
    };

    const submitConsumable = () => {
        startTransition(async () => {
            const result = await createConsumable({
                name: consumable.name,
                category: consumable.category,
                unit: consumable.unit,
                currentStock: Number(consumable.currentStock),
                minimumStock: Number(consumable.minimumStock),
                reorderLevel: Number(consumable.reorderLevel),
                unitPrice: consumable.unitPrice,
                supplier: consumable.supplier,
            });
            if (!result.success) {
                toast.error(result.error ?? 'Could not add that consumable.');
                return;
            }
            toast.success(`${consumable.name.trim()} added to stock`);
            setConsumable(EMPTY_CONSUMABLE);
            router.refresh();
        });
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Add to Inventory</CardTitle>
                <CardDescription>Register a fixed asset or a stocked consumable. Amounts are in rupees.</CardDescription>
                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => setTab('asset')}
                        className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'asset' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
                        data-testid="tab-add-asset"
                    >
                        Asset
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab('consumable')}
                        className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'consumable' ? 'bg-green-600 text-white' : 'bg-muted text-foreground'}`}
                        data-testid="tab-add-consumable"
                    >
                        Consumable
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                {tab === 'asset' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="asset-name" className={LABEL}>Name</label>
                                <input id="asset-name" className={FIELD} value={asset.name} onChange={(e) => setAssetField('name', e.target.value)} placeholder="e.g. Staff room projector" data-testid="asset-name-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-category" className={LABEL}>Category</label>
                                <select id="asset-category" className={FIELD} value={asset.category} onChange={(e) => setAssetField('category', e.target.value)} data-testid="asset-category-input">
                                    {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="asset-condition" className={LABEL}>Condition</label>
                                <select id="asset-condition" className={FIELD} value={asset.condition} onChange={(e) => setAssetField('condition', e.target.value)} data-testid="asset-condition-input">
                                    {ASSET_CONDITIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="asset-serial" className={LABEL}>Serial Number</label>
                                <input id="asset-serial" className={FIELD} value={asset.serialNumber} onChange={(e) => setAssetField('serialNumber', e.target.value)} data-testid="asset-serial-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-location" className={LABEL}>Location</label>
                                <input id="asset-location" className={FIELD} value={asset.location} onChange={(e) => setAssetField('location', e.target.value)} placeholder="e.g. Block A / Lab 2" data-testid="asset-location-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-vendor" className={LABEL}>Vendor</label>
                                <input id="asset-vendor" className={FIELD} value={asset.vendor} onChange={(e) => setAssetField('vendor', e.target.value)} data-testid="asset-vendor-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-price" className={LABEL}>Purchase Price (₹)</label>
                                <input id="asset-price" type="number" min="0" step="0.01" className={FIELD} value={asset.purchasePrice} onChange={(e) => setAssetField('purchasePrice', e.target.value)} data-testid="asset-price-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-purchased" className={LABEL}>Purchase Date</label>
                                <input id="asset-purchased" type="date" className={FIELD} value={asset.purchaseDate} onChange={(e) => setAssetField('purchaseDate', e.target.value)} data-testid="asset-purchase-date-input" />
                            </div>
                            <div>
                                <label htmlFor="asset-warranty" className={LABEL}>Warranty Expiry</label>
                                <input id="asset-warranty" type="date" className={FIELD} value={asset.warrantyExpiry} onChange={(e) => setAssetField('warrantyExpiry', e.target.value)} data-testid="asset-warranty-input" />
                            </div>
                        </div>
                        <Button type="button" onClick={submitAsset} disabled={isPending || !asset.name.trim()} data-testid="asset-submit">
                            {isPending ? 'Saving…' : 'Add Asset'}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label htmlFor="cons-name" className={LABEL}>Item</label>
                                <input id="cons-name" className={FIELD} value={consumable.name} onChange={(e) => setConsumableField('name', e.target.value)} placeholder="e.g. A4 paper" data-testid="consumable-name-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-category" className={LABEL}>Category</label>
                                <select id="cons-category" className={FIELD} value={consumable.category} onChange={(e) => setConsumableField('category', e.target.value)} data-testid="consumable-category-input">
                                    {CONSUMABLE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="cons-unit" className={LABEL}>Unit</label>
                                <input id="cons-unit" className={FIELD} value={consumable.unit} onChange={(e) => setConsumableField('unit', e.target.value)} placeholder="ream, box, litre" data-testid="consumable-unit-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-supplier" className={LABEL}>Supplier</label>
                                <input id="cons-supplier" className={FIELD} value={consumable.supplier} onChange={(e) => setConsumableField('supplier', e.target.value)} data-testid="consumable-supplier-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-stock" className={LABEL}>Current Stock</label>
                                <input id="cons-stock" type="number" min="0" step="1" className={FIELD} value={consumable.currentStock} onChange={(e) => setConsumableField('currentStock', e.target.value)} data-testid="consumable-stock-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-min" className={LABEL}>Minimum Stock</label>
                                <input id="cons-min" type="number" min="0" step="1" className={FIELD} value={consumable.minimumStock} onChange={(e) => setConsumableField('minimumStock', e.target.value)} data-testid="consumable-min-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-reorder" className={LABEL}>Reorder Level</label>
                                <input id="cons-reorder" type="number" min="0" step="1" className={FIELD} value={consumable.reorderLevel} onChange={(e) => setConsumableField('reorderLevel', e.target.value)} data-testid="consumable-reorder-input" />
                            </div>
                            <div>
                                <label htmlFor="cons-price" className={LABEL}>Unit Price (₹)</label>
                                <input id="cons-price" type="number" min="0" step="0.01" className={FIELD} value={consumable.unitPrice} onChange={(e) => setConsumableField('unitPrice', e.target.value)} data-testid="consumable-price-input" />
                            </div>
                        </div>
                        <Button
                            type="button"
                            onClick={submitConsumable}
                            disabled={isPending || !consumable.name.trim() || !consumable.unit.trim()}
                            className="bg-green-600 hover:bg-green-700"
                            data-testid="consumable-submit"
                        >
                            {isPending ? 'Saving…' : 'Add Consumable'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
