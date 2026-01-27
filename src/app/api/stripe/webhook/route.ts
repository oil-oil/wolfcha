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
    console.log(`[Stripe Webhook] ✅ Event received: ${event.type}`);
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
    
    console.log(`[Stripe Webhook] checkout.session.completed - session: ${session.id}, payment_status: ${session.payment_status}, metadata:`, session.metadata);
    
    // Verify payment status
    if (session.payment_status !== "paid") {
      console.log(`[Stripe Webhook] Skipping - payment not paid`);
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.user_id;
    const quantity = parseInt(session.metadata?.quantity || "0", 10);

    if (!userId || quantity < 10) {
      console.log(`[Stripe Webhook] Skipping - invalid metadata: userId=${userId}, quantity=${quantity}`);
      return NextResponse.json({ received: true });
    }

    try {
      // Check if this session was already processed (idempotency)
      const { data: existingTx } = await supabaseAdmin
        .from("payment_transactions")
        .select("id")
        .eq("stripe_session_id", session.id)
        .single();

      if (existingTx) {
        console.log(`[Stripe Webhook] Session ${session.id} already processed, skipping`);
        return NextResponse.json({ received: true });
      }

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

      // Log the transaction
      const { error: txError } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
          user_id: userId,
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent as string,
          amount_cents: session.amount_total || 0,
          currency: session.currency || "usd",
          quantity: quantity,
          credits_added: quantity,
          status: "completed",
        } as never);

      if (txError) {
        console.error(`[Stripe Webhook] Failed to log transaction:`, txError);
        // Don't fail the webhook, credits were already added
      }

      console.log(`[Stripe Webhook] ✅ Added ${quantity} credits to user ${userId}. New balance: ${newCredits}`);
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
