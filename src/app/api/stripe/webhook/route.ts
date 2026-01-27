import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin, ensureAdminClient } from "@/lib/supabase-admin";

// Disable body parsing to get raw body for signature verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    ensureAdminClient();
  } catch (e) {
    console.error("[Stripe Webhook] Server misconfiguration:", e);
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  // Validate webhook secret is configured
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  // Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // Verify payment status
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.user_id;
    const quantity = parseInt(session.metadata?.quantity || "0", 10);

    if (!userId || quantity < 1) {
      // No valid metadata - likely a test event or external checkout
      return NextResponse.json({ received: true });
    }

    try {
      // Get current user credits
      const { data: userCredits, error: fetchError } = await supabaseAdmin
        .from("user_credits")
        .select("credits")
        .eq("id", userId)
        .single();

      if (fetchError || !userCredits) {
        console.error(`[Stripe Webhook] Failed to fetch credits for user ${userId}:`, fetchError);
        return NextResponse.json(
          { error: "Failed to fetch user credits" },
          { status: 500 }
        );
      }

      const currentCredits = (userCredits as { credits: number }).credits;
      const newCredits = currentCredits + quantity;

      // Update user credits
      const { error: updateError } = await supabaseAdmin
        .from("user_credits")
        .update({
          credits: newCredits,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", userId);

      if (updateError) {
        console.error(`[Stripe Webhook] Failed to update credits for user ${userId}:`, updateError);
        return NextResponse.json(
          { error: "Failed to update user credits" },
          { status: 500 }
        );
      }

      console.log(`[Stripe Webhook] Added ${quantity} credits to user ${userId}. New balance: ${newCredits}`);
    } catch (error) {
      console.error(`[Stripe Webhook] Error processing session ${session.id}:`, error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
