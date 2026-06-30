import Stripe from 'stripe';

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required.');
  }

  return new Stripe(key, {
    apiVersion: '2026-02-25.clover',
  });
}

// The core engine for the FinTech Business Model
export class PaymentRoutingService {
  /**
   * Processes a parent's tuition payment and automatically routes the funds.
   * 98.5% goes to the School's bank account.
   * 1.5% stays in our Platform account as pure profit.
   * 
   * @param parentStripeCustomerId The Stripe Customer ID of the parent
   * @param schoolStripeAccountId The connected Stripe Account ID of the school
   * @param amountInCents Total tuition amount (e.g., 500000 for $5,000.00)
   */
  static async processTuitionPayment(
    parentStripeCustomerId: string, 
    schoolStripeAccountId: string, 
    amountInCents: number,
    description: string
  ) {
    const stripe = getStripeClient();
    // Calculate the 1.5% platform fee (take rate)
    const applicationFeeInCents = Math.floor(amountInCents * 0.015);

    try {
      // We use Stripe Connect Destination Charges.
      // The parent pays the platform, and the funds are immediately routed to the school,
      // minus our application fee.
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        customer: parentStripeCustomerId,
        description: description,
        // The 1.5% we keep
        application_fee_amount: applicationFeeInCents,
        // The school receiving the rest of the funds
        transfer_data: {
          destination: schoolStripeAccountId,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      console.log(`Successfully processed $${amountInCents / 100} payment. Platform earned $${applicationFeeInCents / 100}.`);
      return paymentIntent;
    } catch (error) {
      console.error('Failed to process multi-party tuition payment:', error);
      throw error;
    }
  }

  /**
   * Processes an AppExchange third-party subscription and routes the funds.
   * 70% goes to the 3rd Party Developer's bank account.
   * 30% stays in our Platform account as the "App Store Tax".
   */
  static async processAppExchangeSubscription(
    schoolStripeCustomerId: string,
    developerStripeAccountId: string,
    monthlyAmountInCents: number
  ) {
    const stripe = getStripeClient();
    const applicationFeeInCents = Math.floor(monthlyAmountInCents * 0.30);

    // Similar to above, but using a subscription model instead of a one-time charge.
    // (Simplified here as a one-time charge for demonstration)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: monthlyAmountInCents,
      currency: 'usd',
      customer: schoolStripeCustomerId,
      description: 'AppExchange Monthly Subscription',
      application_fee_amount: applicationFeeInCents,
      transfer_data: {
        destination: developerStripeAccountId,
      },
    });

    console.log(`Processed AppExchange purchase. Platform earned $${applicationFeeInCents / 100} (30% tax).`);
    return paymentIntent;
  }
}
