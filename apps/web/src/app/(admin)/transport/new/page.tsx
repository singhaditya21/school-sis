import { requireAuth } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import NewRouteForm from './new-route-form';

export default async function NewRoutePage() {
    try {
        await requireAuth('transport:write');
    } catch (e) {
        redirect('/unauthorized');
    }

    return <NewRouteForm />;
}
