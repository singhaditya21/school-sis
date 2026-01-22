import { getSession } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils';

interface FeeComponent {
    id: string;
    name: string;
    amount: number;
    frequency: string;
    sequence: number;
}

interface FeePlan {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    academicYear: { name: string };
    components: FeeComponent[];
    invoiceCount: number;
}

// Mock fee plans data
const mockFeePlans: FeePlan[] = [
    {
        id: 'fp-1',
        name: 'Class 1-5 Standard Fee',
        description: 'Annual fee structure for primary classes',
        isActive: true,
        academicYear: { name: '2025-26' },
        components: [
            { id: 'c1', name: 'Tuition Fee', amount: 24000, frequency: 'Quarterly', sequence: 1 },
            { id: 'c2', name: 'Development Fee', amount: 5000, frequency: 'Annual', sequence: 2 },
            { id: 'c3', name: 'Activity Fee', amount: 3000, frequency: 'Annual', sequence: 3 },
            { id: 'c4', name: 'Computer Lab', amount: 2000, frequency: 'Annual', sequence: 4 },
        ],
        invoiceCount: 1800
    },
    {
        id: 'fp-2',
        name: 'Class 6-10 Standard Fee',
        description: 'Annual fee structure for middle and secondary classes',
        isActive: true,
        academicYear: { name: '2025-26' },
        components: [
            { id: 'c5', name: 'Tuition Fee', amount: 36000, frequency: 'Quarterly', sequence: 1 },
            { id: 'c6', name: 'Development Fee', amount: 8000, frequency: 'Annual', sequence: 2 },
            { id: 'c7', name: 'Lab Fee', amount: 5000, frequency: 'Annual', sequence: 3 },
            { id: 'c8', name: 'Sports Fee', amount: 4000, frequency: 'Annual', sequence: 4 },
        ],
        invoiceCount: 1800
    },
    {
        id: 'fp-3',
        name: 'Class 11-12 Science Stream',
        description: 'Fee structure for senior secondary science students',
        isActive: true,
        academicYear: { name: '2025-26' },
        components: [
            { id: 'c9', name: 'Tuition Fee', amount: 48000, frequency: 'Quarterly', sequence: 1 },
            { id: 'c10', name: 'Development Fee', amount: 10000, frequency: 'Annual', sequence: 2 },
            { id: 'c11', name: 'Lab Fee', amount: 8000, frequency: 'Annual', sequence: 3 },
            { id: 'c12', name: 'Project Fee', amount: 5000, frequency: 'Annual', sequence: 4 },
        ],
        invoiceCount: 720
    }
];

export default async function FeePlansPage() {
    const session = await getSession();

    // Fetch fee plans from Java API
    let feePlans: FeePlan[] = [];
    let useMockData = false;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/fees/plans`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );

        if (response.ok) {
            const data = await response.json();
            feePlans = data.data?.content || data.content || [];
            if (feePlans.length === 0) useMockData = true;
        } else {
            useMockData = true;
        }
    } catch (error) {
        console.error('[FeePlans] API Error, using mock data:', error);
        useMockData = true;
    }

    // Use mock data as fallback
    if (useMockData) {
        feePlans = mockFeePlans;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Fee Plans</h1>
                    <p className="text-gray-600 mt-1">
                        Configure fee structures for different grades and academic years
                    </p>
                </div>
                <a
                    href="/fees/plans/new"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <span>➕</span>
                    Create Fee Plan
                </a>
            </div>

            {/* Fee Plans List */}
            {feePlans.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">💰</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No Fee Plans Yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                        Create your first fee plan to start generating invoices
                    </p>
                    <a
                        href="/fees/plans/new"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <span>➕</span>
                        Create Fee Plan
                    </a>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {feePlans.map((plan) => {
                        const totalAmount = plan.components?.reduce(
                            (sum, comp) => sum + (comp.amount || 0),
                            0
                        ) || 0;

                        return (
                            <div
                                key={plan.id}
                                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                            >
                                {/* Header */}
                                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 border-b border-gray-200">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">
                                                {plan.name}
                                            </h3>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {plan.academicYear?.name || 'N/A'}
                                            </p>
                                        </div>
                                        <span
                                            className={`px-3 py-1 rounded-full text-xs font-semibold ${plan.isActive
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-gray-100 text-gray-600'
                                                }`}
                                        >
                                            {plan.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    {plan.description && (
                                        <p className="text-sm text-gray-600 mt-3">
                                            {plan.description}
                                        </p>
                                    )}

                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-bold text-gray-900">
                                                {formatCurrency(totalAmount)}
                                            </span>
                                            <span className="text-sm text-gray-500">total</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Components */}
                                <div className="p-6">
                                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                        Fee Components
                                    </h4>
                                    <div className="space-y-2">
                                        {plan.components?.map((component) => (
                                            <div
                                                key={component.id}
                                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                            >
                                                <div>
                                                    <p className="font-medium text-gray-900">
                                                        {component.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {component.frequency?.replace('_', ' ')}
                                                    </p>
                                                </div>
                                                <p className="font-semibold text-gray-900">
                                                    {formatCurrency(component.amount || 0)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-600">
                                            <span className="font-semibold">
                                                {plan.invoiceCount || 0}
                                            </span>{' '}
                                            invoices generated
                                        </div>
                                        <div className="flex gap-2">
                                            <a
                                                href={`/fees/plans/${plan.id}/edit`}
                                                className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                Edit
                                            </a>
                                            <a
                                                href={`/fees/invoices/generate?planId=${plan.id}`}
                                                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                Generate Invoices
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
