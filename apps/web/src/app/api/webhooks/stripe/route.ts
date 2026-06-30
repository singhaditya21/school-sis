import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { pool, runWithRlsBypass, runWithTenantContext } from '@/lib/db';
import Stripe from 'stripe';

export const dynamic = "force-dynamic";

// Stripe CLI testing: 
// stripe listen --forward-to localhost:3000/api/webhooks/stripe

export async function POST(req: NextRequest) {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature') as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
    } catch (err: any) {
        console.error(`⚠️  Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                
                // Retrieve the company ID injected from checkout creation
                const companyId = session.client_reference_id;
                const subscriptionId = session.subscription as string;
                const planType = session.metadata?.planType;
                
                const invoiceId = session.metadata?.invoiceId;
                const tenantId = session.metadata?.tenantId;

                if (invoiceId) {
                    if (!tenantId) {
                        throw new Error('Invoice checkout session is missing tenant metadata');
                    }

                    await runWithTenantContext(tenantId, async () => {
                        const client = await pool.connect();
                        try {
                            await client.query('BEGIN');
                            const invoiceRes = await client.query('SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2', [invoiceId, tenantId]);
                            if (invoiceRes.rows.length > 0) {
                                const invoice = invoiceRes.rows[0];
                                const amountPaid = (session.amount_total || 0) / 100;

                                await client.query(
                                    'UPDATE invoices SET paid_amount = paid_amount + $1, status = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
                                    [amountPaid, 'PAID', invoiceId, tenantId]
                                );

                                await client.query(
                                    `INSERT INTO payments (
                                        tenant_id, invoice_id, student_id, amount, method, status, transaction_id, created_at, paid_at
                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
                                    [
                                        tenantId,
                                        invoiceId,
                                        invoice.student_id,
                                        amountPaid,
                                        'ONLINE',
                                        'COMPLETED',
                                        session.payment_intent || session.id
                                    ]
                                );
                            }
                            await client.query('COMMIT');
                            console.log(`✅ Invoice ${invoiceId} marked as PAID`);
                        } catch (err: any) {
                            await client.query('ROLLBACK');
                            console.error('Invoice Webhook DB Error:', err);
                            throw err;
                        } finally {
                            client.release();
                        }
                    });
                    break;
                }

                if (!companyId) {
                    throw new Error('No client_reference_id found in session');
                }

                // Activate the company immediately upon successful checkout
                await runWithRlsBypass(() => pool.query(`
                    UPDATE companies 
                    SET stripe_subscription_id = $1, 
                        subscription_tier = $2, 
                        billing_status = 'ACTIVE', 
                        is_active = true 
                    WHERE id = $3
                `, [subscriptionId, planType || 'CORE', companyId]));
                
                console.log(`✅ Company ${companyId} successfully provisioned and paid for tier: ${planType}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                
                const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'ACTIVE' :
                               subscription.status === 'past_due' ? 'PAST_DUE' : 
                               subscription.status === 'canceled' ? 'CANCELED' : 'UNPAID';

                // Find the company by their subscription ID
                await runWithRlsBypass(() => pool.query(`
                    UPDATE companies 
                    SET billing_status = $1, 
                        is_active = $2, 
                        stripe_current_period_end = $3 
                    WHERE stripe_subscription_id = $4
                `, [status, status === 'ACTIVE', new Date((subscription as any).current_period_end * 1000), subscription.id]));

                console.log(`🔄 Subscription ${subscription.id} status updated to: ${status}`);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;

                // Deactivate the company completely
                await runWithRlsBypass(() => pool.query(`
                    UPDATE companies 
                    SET billing_status = 'CANCELED', 
                        is_active = false 
                    WHERE stripe_subscription_id = $1
                `, [subscription.id]));
                
                console.log(`❌ Subscription ${subscription.id} canceled. Company access revoked.`);
                break;
            }
            
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error: any) {
        console.error(`[WEBHOOK_HANDLER_ERROR]`, error.message);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true });
}
