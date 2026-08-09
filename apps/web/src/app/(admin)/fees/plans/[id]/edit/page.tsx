import { notFound } from 'next/navigation';
import { getFeePlanForEdit } from '@/lib/actions/fees';
import EditFeePlanForm from './edit-form';

type EditFeePlanPageProps = {
    params: Promise<{ id: string }>;
};

export default async function EditFeePlanPage({ params }: EditFeePlanPageProps) {
    const { id } = await params;
    const plan = await getFeePlanForEdit(id);
    if (!plan) notFound();

    return <EditFeePlanForm key={plan.updatedAt} plan={plan} />;
}
