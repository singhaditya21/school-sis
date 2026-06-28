'use server';

import { pool } from '@/lib/db';
import { stripe } from '@/lib/stripe/server';
import { headers } from 'next/headers';

export async function createCheckoutSession(invoiceId: string) {
    const client = await pool.connect();
    
    try {
        const res = await client.query(
            'SELECT id, invoice_number, total_amount, paid_amount, status FROM invoices WHERE id = $1',
            [invoiceId]
        );
        
        if (res.rows.length === 0) {
            throw new Error('Invoice not found');
        }
        
        const invoice = res.rows[0];
        
        if (invoice.status === 'PAID') {
            throw new Error('Invoice is already paid');
        }
        
        const amountDue = parseFloat(invoice.total_amount) - parseFloat(invoice.paid_amount);
        const amountInCents = Math.round(amountDue * 100);
        
        const headersList = await headers();
        const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: {
                            name: `Invoice #${invoice.invoice_number}`,
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/my-fees?success=true&invoiceId=${invoiceId}`,
            cancel_url: `${origin}/my-fees?canceled=true`,
            metadata: {
                invoiceId: invoice.id,
            },
        });
        
        if (!session.url) {
            throw new Error('Failed to create Stripe session');
        }
        
        return { url: session.url };
        
    } finally {
        client.release();
    }
}
