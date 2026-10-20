import { createClient } from "@/lib/supabase/server";
import { adminSupabase, isBillingConfigured, stripe } from "@/lib/billing";

export const runtime = "nodejs";

/** Opens the Stripe customer portal (change card, cancel, invoices). */
export async function POST(request: Request) {
  if (!isBillingConfigured()) return Response.json({ error: "Payments aren't set up yet." }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const { data } = await adminSupabase().from("user_plans").select("stripe_customer_id").eq("user_id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
  if (!data?.stripe_customer_id) return Response.json({ error: "No subscription found." }, { status: 404 });
  const session = await stripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${new URL(request.url).origin}/settings`,
  });
  return Response.json({ url: session.url });
}
