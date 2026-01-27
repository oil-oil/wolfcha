import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Get Stripe API key from environment variable
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = process.env.STRIPE_PRICE_ID;

// Initialize Stripe client (will be created after validation)
let stripe: Stripe | null = null;

if (STRIPE_SECRET_KEY) {
  stripe = new Stripe(STRIPE_SECRET_KEY);
}

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    if (!STRIPE_SECRET_KEY) {
      console.error("[Stripe Payment Link] STRIPE_SECRET_KEY is not configured");
      return NextResponse.json(
        { error: "Payment configuration error. Please contact support." },
        { status: 500 }
      );
    }

    if (!PRICE_ID) {
      console.error("[Stripe Payment Link] STRIPE_PRICE_ID is not configured");
      return NextResponse.json(
        { error: "Payment configuration error. Please contact support." },
        { status: 500 }
      );
    }

    if (!stripe) {
      console.error("[Stripe Payment Link] Stripe client initialization failed");
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

    if (!quantity || quantity < 10) {
      return NextResponse.json(
        { error: "Invalid quantity. Must be at least 10." },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    console.log(`[Stripe Payment Link] Creating checkout session for user ${user.id}, quantity: ${quantity}`);
    
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

    console.log(`[Stripe Payment Link] Created session ${session.id} with metadata:`, { user_id: user.id, quantity });
    
    return NextResponse.json({ url: session.url });
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Stripe.errors.StripeError) {
      const stripeError = error as Stripe.errors.StripeError;
      console.error("[Stripe Payment Link] Stripe API error:", {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        statusCode: stripeError.statusCode,
        requestId: stripeError.requestId,
        param: (stripeError as any).param,
      });
      
      // Return more specific error messages based on error type
      if (stripeError.type === "StripeInvalidRequestError") {
        // Common causes: invalid price ID, invalid parameters
        return NextResponse.json(
          { 
            error: "Invalid payment request",
            details: stripeError.message,
            hint: "Please check if STRIPE_PRICE_ID is correct and exists in your Stripe account",
          },
          { status: 400 }
        );
      }
      
      if (stripeError.type === "StripeAuthenticationError") {
        console.error("[Stripe Payment Link] Authentication failed - check STRIPE_SECRET_KEY");
        return NextResponse.json(
          { 
            error: "Payment service authentication error",
            hint: "Please verify STRIPE_SECRET_KEY is correct and has proper permissions",
          },
          { status: 500 }
        );
      }
      
      if (stripeError.type === "StripeAPIError") {
        console.error("[Stripe Payment Link] Stripe API internal error");
        return NextResponse.json(
          { 
            error: "Payment service temporarily unavailable",
            details: stripeError.message,
          },
          { status: 502 }
        );
      }
      
      return NextResponse.json(
        { 
          error: "Payment processing error",
          details: stripeError.message,
          type: stripeError.type,
        },
        { status: stripeError.statusCode || 500 }
      );
    }
    
    // Handle non-Stripe errors
    console.error("[Stripe Payment Link] Unexpected error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json(
      { 
        error: "Failed to create checkout session",
        hint: "Check server logs for detailed error information",
      },
      { status: 500 }
    );
  }
}
