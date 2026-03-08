import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getFeePlans } from '@/lib/actions/fees';
import { getGradesList } from '@/lib/actions/students';
import { generateBulkInvoices, getInvoiceGenerationPreview } from '@/lib/actions/invoice-generation';
import InvoiceGenerationForm from '@/components/fees/invoice-generation-form';

export default async function InvoiceGeneratePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const [feePlans, grades] = await Promise.all([
        getFeePlans(),
        getGradesList(),
    ]);

    // Server action wrappers for the client component
    async function handleGenerate(data: {
        feePlanId: string;
        gradeId?: string;
        dueDate: string;
        description?: string;
    }) {
        'use server';
        return generateBulkInvoices({
            feePlanId: data.feePlanId,
            gradeId: data.gradeId,
            dueDate: data.dueDate,
            description: data.description,
        });
    }

    async function handlePreview(feePlanId: string, gradeId?: string) {
        'use server';
        return getInvoiceGenerationPreview(feePlanId, gradeId);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div />
                <Link href="/fees" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to Fees
                </Link>
            </div>
            <InvoiceGenerationForm
                feePlans={feePlans.map(p => ({
                    id: p.id,
                    name: p.name,
                    isActive: p.isActive,
                }))}
                grades={grades.map(g => ({
                    id: g.id,
                    name: g.name,
                }))}
                onGenerate={handleGenerate}
                onPreview={handlePreview}
            />
        </div>
    );
}
