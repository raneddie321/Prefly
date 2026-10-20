import Stripe from "stripe";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { isSupabaseConfigured, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Prefly Pro billing with Stripe Checkout. Enabled when these are set:
 * STRIPE_SECRET_KEY, STRIPE_PRICE_ID (a recurring price), STRIPE_WEBHOOK_SECRET
 * and SUPABASE_SERVICE_ROLE_KEY (to write user_plans from the webhook).
 */
export function isBillingConfigured(): boolean {
  return Boolean(
    isSupabaseConfigured() && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripeClient;
}

/** Service-role client: bypasses row-level security. Server only. */
export function adminSupabase() {
  return createSupabase(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Mirrors a Stripe subscription into public.user_plans. */
export async function syncSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;
  const active = subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due";
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { error } = await adminSupabase()
    .from("user_plans")
    .upsert({
      user_id: userId,
      plan: active ? "pro" : "free",
      status: subscription.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      stripe_customer_id: customer,
      stripe_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
