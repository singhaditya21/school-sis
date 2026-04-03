import { NextResponse } from 'next/server';
import { captureLeadAction } from '@/lib/actions/marketing';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        
        // Pass to the native Server Action which handles context and insertion
        const result = await captureLeadAction(formData);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('API /leads ERROR:', error);
        return NextResponse.json({ error: 'Internal Server Error processing lead.' }, { status: 500 });
    }
}
