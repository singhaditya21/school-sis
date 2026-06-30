import { NextResponse } from 'next/server';
import { PaymentRoutingService } from '../../../../lib/services/payments';

export async function POST(req: Request) {
  try {
    const { parentCustomerId, schoolAccountId, amountInCents } = await req.json();

    if (!parentCustomerId || !schoolAccountId || !amountInCents) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Call the Stripe Connect payment engine
    const paymentIntent = await PaymentRoutingService.processTuitionPayment(
      parentCustomerId,
      schoolAccountId,
      amountInCents,
      'Tuition Payment via Parent Mobile Portal'
    );

    // Return the required params for @stripe/stripe-react-native payment sheet
    return NextResponse.json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: 'mock_ek_for_development', // In a real app, generate an ephemeral key for customer session
      customer: parentCustomerId,
    });
  } catch (error: any) {
    console.error("Failed to generate payment sheet parameters:", error);
    return NextResponse.json({ error: error.message || "Stripe Connection Error" }, { status: 500 });
  }
}
