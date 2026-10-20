import type Stripe from "stripe";
import { isBillingConfigured, stripe, syncSubscription } from "@/lib/billing";

export const runtime = "nodejs";

/** Stripe webhook: keeps public.user_plans in sync with subscriptions. */
export async function POST(request: Request) {
  if (!isBillingConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) return new Response("Billing not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe().subscriptions.retrieve(id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
  }
  return Response.json({ received: true });
}
