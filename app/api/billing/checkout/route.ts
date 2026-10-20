import { createClient } from "@/lib/supabase/server";
import { adminSupabase, isBillingConfigured, stripe } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isBillingConfigured()) return Response.json({ error: "Payments aren't set up yet.", code: "billing" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous || !user.email) {
    return Response.json({ error: "Create an account first so your Pro plan is saved to it.", code: "account" }, { status: 401 });
  }
  const origin = new URL(request.url).origin;
  const { data: existing } = await adminSupabase().from("user_plans").select("stripe_customer_id").eq("user_id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: user.id,
    ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id } : { customer_email: user.email }),
    subscription_data: { metadata: { user_id: user.id } },
    metadata: { user_id: user.id },
    success_url: `${origin}/settings?upgraded=1`,
    cancel_url: `${origin}/pricing`,
  });
  return Response.json({ url: session.url });
}
