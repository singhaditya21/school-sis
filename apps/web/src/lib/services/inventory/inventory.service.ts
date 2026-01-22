/**
 * Inventory Management Service
 * Handles assets, consumables, and stock tracking
 */

export interface Asset {
    id: string;
    name: string;
    category: 'FURNITURE' | 'IT_EQUIPMENT' | 'SPORTS' | 'LAB_EQUIPMENT' | 'AUDIO_VISUAL' | 'OTHER';
    serialNumber: string;
    purchaseDate: string;
    purchasePrice: number;
    vendor: string;
    location: string;
    assignedTo?: string;
    condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_REPAIR' | 'DISPOSED';
    lastMaintenanceDate?: string;
    warrantyExpiry?: string;
    notes?: string;
}

export interface Consumable {
    id: string;
    name: string;
    category: 'STATIONERY' | 'CLEANING' | 'SPORTS' | 'LAB_SUPPLIES' | 'FIRST_AID' | 'OFFICE';
    unit: string;
    currentStock: number;
    minimumStock: number;
    reorderLevel: number;
    unitPrice: number;
    lastRestockDate: string;
    supplier: string;
}

export interface StockAlert {
    id: string;
    itemId: string;
    itemName: string;
    type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRING_SOON' | 'MAINTENANCE_DUE';
    severity: 'critical' | 'warning' | 'info';
    message: string;
    createdAt: string;
}

// Mock assets
export const mockAssets: Asset[] = [
    { id: 'a1', name: 'Student Desk (Double)', category: 'FURNITURE', serialNumber: 'FUR-2024-001', purchaseDate: '2024-01-15', purchasePrice: 4500, vendor: 'SchoolMart Furniture', location: 'Class 10-A', condition: 'GOOD' },
    { id: 'a2', name: 'Dell Optiplex Desktop', category: 'IT_EQUIPMENT', serialNumber: 'IT-2024-101', purchaseDate: '2024-03-20', purchasePrice: 45000, vendor: 'Dell India', location: 'Computer Lab 1', condition: 'EXCELLENT', warrantyExpiry: '2027-03-20' },
    { id: 'a3', name: 'Epson Projector EB-X41', category: 'AUDIO_VISUAL', serialNumber: 'AV-2023-012', purchaseDate: '2023-07-10', purchasePrice: 35000, vendor: 'Epson India', location: 'Room 101', condition: 'GOOD', warrantyExpiry: '2026-07-10' },
    { id: 'a4', name: 'Chemistry Lab Table', category: 'LAB_EQUIPMENT', serialNumber: 'LAB-2022-005', purchaseDate: '2022-06-15', purchasePrice: 12000, vendor: 'Lab Essentials', location: 'Chemistry Lab', condition: 'FAIR', lastMaintenanceDate: '2025-06-15' },
    { id: 'a5', name: 'Basketball Hoop (Outdoor)', category: 'SPORTS', serialNumber: 'SPT-2023-003', purchaseDate: '2023-04-01', purchasePrice: 25000, vendor: 'Sports Zone', location: 'Basketball Court', condition: 'GOOD' },
    { id: 'a6', name: 'HP LaserJet Printer', category: 'IT_EQUIPMENT', serialNumber: 'IT-2024-102', purchaseDate: '2024-02-28', purchasePrice: 28000, vendor: 'HP India', location: 'Admin Office', condition: 'EXCELLENT', warrantyExpiry: '2027-02-28' },
    { id: 'a7', name: 'Whiteboard (8x4 ft)', category: 'FURNITURE', serialNumber: 'FUR-2023-045', purchaseDate: '2023-01-10', purchasePrice: 3500, vendor: 'SchoolMart Furniture', location: 'Class 9-B', condition: 'GOOD' },
    { id: 'a8', name: 'Microscope (Student)', category: 'LAB_EQUIPMENT', serialNumber: 'LAB-2024-020', purchaseDate: '2024-08-15', purchasePrice: 8500, vendor: 'Lab Essentials', location: 'Biology Lab', condition: 'EXCELLENT' },
    { id: 'a9', name: 'CCTV Camera (Dome)', category: 'IT_EQUIPMENT', serialNumber: 'IT-2024-200', purchaseDate: '2024-05-01', purchasePrice: 5500, vendor: 'SecureTech', location: 'Main Corridor', condition: 'EXCELLENT' },
    { id: 'a10', name: 'Staff Chair (Ergonomic)', category: 'FURNITURE', serialNumber: 'FUR-2024-080', purchaseDate: '2024-04-01', purchasePrice: 6500, vendor: 'Office Comfort', location: 'Staff Room', condition: 'GOOD', assignedTo: 'Staff Room' },
];

// Mock consumables
export const mockConsumables: Consumable[] = [
    { id: 'c1', name: 'A4 Paper (500 sheets)', category: 'STATIONERY', unit: 'ream', currentStock: 45, minimumStock: 20, reorderLevel: 30, unitPrice: 250, lastRestockDate: '2026-01-10', supplier: 'Stationery World' },
    { id: 'c2', name: 'Whiteboard Marker (Black)', category: 'STATIONERY', unit: 'piece', currentStock: 120, minimumStock: 50, reorderLevel: 80, unitPrice: 35, lastRestockDate: '2026-01-05', supplier: 'Stationery World' },
    { id: 'c3', name: 'Chalk (White, box of 100)', category: 'STATIONERY', unit: 'box', currentStock: 8, minimumStock: 10, reorderLevel: 15, unitPrice: 85, lastRestockDate: '2025-12-20', supplier: 'Stationery World' },
    { id: 'c4', name: 'Floor Cleaner (5L)', category: 'CLEANING', unit: 'bottle', currentStock: 12, minimumStock: 8, reorderLevel: 10, unitPrice: 350, lastRestockDate: '2026-01-08', supplier: 'CleanPro Supplies' },
    { id: 'c5', name: 'Hand Sanitizer (500ml)', category: 'FIRST_AID', unit: 'bottle', currentStock: 25, minimumStock: 15, reorderLevel: 20, unitPrice: 180, lastRestockDate: '2026-01-12', supplier: 'MediCare' },
    { id: 'c6', name: 'Cricket Ball (Leather)', category: 'SPORTS', unit: 'piece', currentStock: 3, minimumStock: 5, reorderLevel: 8, unitPrice: 450, lastRestockDate: '2025-11-15', supplier: 'Sports Zone' },
    { id: 'c7', name: 'Printer Toner (HP)', category: 'OFFICE', unit: 'cartridge', currentStock: 2, minimumStock: 3, reorderLevel: 5, unitPrice: 4500, lastRestockDate: '2026-01-02', supplier: 'HP India' },
    { id: 'c8', name: 'Lab Gloves (Box of 100)', category: 'LAB_SUPPLIES', unit: 'box', currentStock: 15, minimumStock: 10, reorderLevel: 12, unitPrice: 550, lastRestockDate: '2026-01-08', supplier: 'Lab Essentials' },
    { id: 'c9', name: 'Dustbin Bags (Pack of 50)', category: 'CLEANING', unit: 'pack', currentStock: 18, minimumStock: 10, reorderLevel: 15, unitPrice: 120, lastRestockDate: '2026-01-05', supplier: 'CleanPro Supplies' },
    { id: 'c10', name: 'First Aid Band-aids (Box)', category: 'FIRST_AID', unit: 'box', currentStock: 6, minimumStock: 5, reorderLevel: 8, unitPrice: 95, lastRestockDate: '2025-12-28', supplier: 'MediCare' },
];

/**
 * Generate stock alerts
 */
export function generateStockAlerts(): StockAlert[] {
    const alerts: StockAlert[] = [];

    mockConsumables.forEach(item => {
        if (item.currentStock <= 0) {
            alerts.push({
                id: `alert-${item.id}-out`,
                itemId: item.id,
                itemName: item.name,
                type: 'OUT_OF_STOCK',
                severity: 'critical',
                message: `${item.name} is out of stock! Current: 0 ${item.unit}`,
                createdAt: new Date().toISOString(),
            });
        } else if (item.currentStock <= item.minimumStock) {
            alerts.push({
                id: `alert-${item.id}-low`,
                itemId: item.id,
                itemName: item.name,
                type: 'LOW_STOCK',
                severity: 'warning',
                message: `${item.name} is low. Current: ${item.currentStock} ${item.unit}, Minimum: ${item.minimumStock}`,
                createdAt: new Date().toISOString(),
            });
        } else if (item.currentStock <= item.reorderLevel) {
            alerts.push({
                id: `alert-${item.id}-reorder`,
                itemId: item.id,
                itemName: item.name,
                type: 'LOW_STOCK',
                severity: 'info',
                message: `${item.name} below reorder level. Current: ${item.currentStock} ${item.unit}`,
                createdAt: new Date().toISOString(),
            });
        }
    });

    // Check for assets needing maintenance
    mockAssets.forEach(asset => {
        if (asset.condition === 'NEEDS_REPAIR') {
            alerts.push({
                id: `alert-${asset.id}-repair`,
                itemId: asset.id,
                itemName: asset.name,
                type: 'MAINTENANCE_DUE',
                severity: 'warning',
                message: `${asset.name} needs repair. Location: ${asset.location}`,
                createdAt: new Date().toISOString(),
            });
        }
    });

    return alerts;
}

/**
 * Get inventory statistics
 */
export function getInventoryStats() {
    const alerts = generateStockAlerts();
    return {
        totalAssets: mockAssets.length,
        assetsValue: mockAssets.reduce((sum, a) => sum + a.purchasePrice, 0),
        assetsNeedingRepair: mockAssets.filter(a => a.condition === 'NEEDS_REPAIR').length,
        totalConsumables: mockConsumables.length,
        lowStockItems: mockConsumables.filter(c => c.currentStock <= c.minimumStock).length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        warningAlerts: alerts.filter(a => a.severity === 'warning').length,
    };
}
