'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setDocumentVerifiedAction } from './_lib/actions';

export default function VerificationButton({
    documentId,
    isVerified,
}: {
    documentId: string;
    isVerified: boolean;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function toggle() {
        setPending(true);
        try {
            const result = await setDocumentVerifiedAction({ documentId, verified: !isVerified });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the document.');
                return;
            }
            toast.success(isVerified ? 'Verification withdrawn' : 'Document verified');
            router.refresh();
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setPending(false);
        }
    }

    return (
        <Button
            variant={isVerified ? 'ghost' : 'outline'}
            size="sm"
            onClick={toggle}
            disabled={pending}
        >
            {pending ? 'Saving…' : isVerified ? 'Withdraw' : 'Verify'}
        </Button>
    );
}
