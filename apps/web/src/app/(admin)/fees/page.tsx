import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { getFeePlans, getFeePlanComponents } from '@/lib/actions/fees';

export default async function FeePlansPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const feePlans = await getFeePlans();

    // Get components for each plan
    const plansWithComponents = await Promise.all(
        feePlans.map(async (plan) => {
            const components = await getFeePlanComponents(plan.id);
            return { ...plan, components };
        })
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Fee Management</h1>
                    <p className="text-gray-600 mt-1">{feePlans.length} fee plans configured</p>
                </div>
                <a href="/fees/plans/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    New Fee Plan
                </a>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Total Plans</p>
                    <p className="text-3xl font-bold text-gray-900">{feePlans.length}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Total Invoices</p>
                    <p className="text-3xl font-bold text-gray-900">
                        {feePlans.reduce((sum, p) => sum + p.invoiceCount, 0)}
                    </p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <p className="text-sm text-gray-500">Total Collected</p>
                    <p className="text-3xl font-bold text-green-600">
                        {formatCurrency(feePlans.reduce((sum, p) => sum + p.totalCollected, 0))}
                    </p>
                </div>
            </div>

            {/* Fee Plans */}
            <div className="space-y-4">
                {plansWithComponents.map((plan) => (
                    <div key={plan.id} className="bg-white rounded-xl shadow-sm border">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                                    <p className="text-sm text-gray-500">
                                        {plan.academicYearName} • {plan.invoiceCount} invoices
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${plan.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                    }`}>
                                    {plan.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            {plan.description && (
                                <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                            )}

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Component</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Frequency</th>
                                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {plan.components.map((comp) => (
                                            <tr key={comp.id}>
                                                <td className="px-4 py-2 font-medium">{comp.name}</td>
                                                <td className="px-4 py-2 text-right">{formatCurrency(Number(comp.amount))}</td>
                                                <td className="px-4 py-2 text-center capitalize">{comp.frequency.toLowerCase().replace('_', ' ')}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${comp.isOptional ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                        {comp.isOptional ? 'Optional' : 'Mandatory'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 pt-4 border-t flex items-center justify-between">
                                <p className="text-sm text-gray-500">
                                    Collected: <span className="font-semibold text-green-600">{formatCurrency(plan.totalCollected)}</span>
                                </p>
                                <a href={`/fees/invoices?planId=${plan.id}`} className="text-blue-600 hover:underline text-sm">
                                    View Invoices →
                                </a>
                            </div>
                        </div>
                    </div>
                ))}

                {plansWithComponents.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
                        No fee plans configured yet. Create your first fee plan to get started.
                    </div>
                )}
            </div>
        </div>
    );
}
