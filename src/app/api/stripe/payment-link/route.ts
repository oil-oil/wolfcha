import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Get Stripe Price ID from environment variable
// You can find this in Stripe Dashboard > Products > [Your Product] > Pricing
const PRICE_ID = process.env.STRIPE_PRICE_ID;

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    if (!PRICE_ID) {
      console.error("[Stripe Payment Link] STRIPE_PRICE_ID is not configured");
      return NextResponse.json(
        { error: "Payment configuration error. Please contact support." },
        { status: 500 }
      );
    }

    // Authenticate user
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { quantity } = await request.json();

    if (!quantity || quantity < 2) {
      return NextResponse.json(
        { error: "Invalid quantity. Must be at least 2." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create a Checkout Session instead of Payment Link to track user
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: PRICE_ID,
          quantity: quantity,
        },
      ],
      metadata: {
        user_id: user.id,
        quantity: quantity.toString(),
      },
      success_url: `${origin}?payment=success`,
      cancel_url: `${origin}?payment=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Stripe Payment Link] Checkout session error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
