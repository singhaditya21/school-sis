import { getSession } from '@/lib/auth/session';
import { getCashflowData } from '@/lib/services/fees/cashflow.service';
import { formatCurrency } from '@/lib/utils';

export default async function CashflowPage() {
    const session = await getSession();

    // Get cashflow data from Java API
    const cashflow = await getCashflowData(session.token || '');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Cashflow Forecast</h1>
                <p className="text-gray-600 mt-1">
                    Predicted collections based on due dates and payment patterns
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
                    <p className="text-sm opacity-90">Total Collections</p>
                    <p className="text-4xl font-bold mt-3">
                        {formatCurrency(cashflow.totalCollections)}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
                    <p className="text-sm opacity-90">Total Refunds</p>
                    <p className="text-4xl font-bold mt-3">
                        {formatCurrency(cashflow.totalRefunds)}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                    <p className="text-sm opacity-90">Net Cashflow</p>
                    <p className="text-4xl font-bold mt-3">
                        {formatCurrency(cashflow.netCashflow)}
                    </p>
                </div>
            </div>

            {/* Daily Timeline */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Daily Collections
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {cashflow.dailyData.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No cashflow data available.</p>
                    ) : (
                        cashflow.dailyData.map((day, index) => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="text-sm">
                                    <p className="font-semibold text-gray-900">{day.date}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-gray-900">
                                        {formatCurrency(day.collections)}
                                    </p>
                                    {day.refunds > 0 && (
                                        <p className="text-xs text-red-500">-{formatCurrency(day.refunds)}</p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Methodology Note */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                    📊 Forecast Methodology
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Based on invoice due dates and historical payment patterns</li>
                    <li>• Calculates average payment lag from last 90 days</li>
                    <li>• Includes 30% recovery estimate for overdue invoices</li>
                    <li>• Updates daily as new payments are recorded</li>
                </ul>
            </div>
        </div>
    );
}
