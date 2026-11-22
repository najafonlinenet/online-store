import {
  integrationFetch,
  integrationStatus,
  sendEmail,
} from "@every-app/sdk/server";
import { env } from "cloudflare:workers";

// Card payments (Stripe) and order email are optional: each is used only
// when the Gateway says it's set up, and anything it refuses leaves the
// order as it is.

const BACKGROUND = { background: true } as const;

export async function isReady(provider: "stripe" | "email"): Promise<boolean> {
  try {
    const status = await integrationStatus({ env, provider, for: BACKGROUND });
    return status.ready;
  } catch {
    return false;
  }
}

async function stripe(path: string, init?: { method?: string; form?: Record<string, string> }) {
  const call = integrationFetch({ env, provider: "stripe", for: BACKGROUND });
  const response = await call(`https://api.stripe.com/v1/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.form
      ? { "content-type": "application/x-www-form-urlencoded" }
      : undefined,
    body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) {
    throw new Error("The card payment service refused the request.");
  }
  return body;
}

export async function createCheckoutSession(order: {
  id: string;
  number: number;
  total: number;
  currency: string;
  email: string;
  statusUrl: string;
  cancelUrl: string;
  storeName: string;
}): Promise<{ id: string; url: string }> {
  const body = await stripe("checkout/sessions", {
    method: "POST",
    form: {
      mode: "payment",
      customer_email: order.email,
      success_url: `${order.statusUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: order.cancelUrl,
      client_reference_id: order.id,
      "metadata[order_id]": order.id,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(order.total),
      "line_items[0][price_data][product_data][name]": `${order.storeName} order #${order.number}`,
    },
  });
  return { id: String(body.id), url: String(body.url) };
}

export async function readCheckoutSession(id: string) {
  const body = await stripe(`checkout/sessions/${encodeURIComponent(id)}`);
  return {
    paid: body.payment_status === "paid",
    amountTotal: Number(body.amount_total),
    paymentIntent: typeof body.payment_intent === "string" ? body.payment_intent : null,
    orderId: (body.metadata as Record<string, string> | undefined)?.order_id ?? null,
  };
}

export async function refundPayment(paymentIntent: string): Promise<void> {
  await stripe("refunds", { method: "POST", form: { payment_intent: paymentIntent } });
}

export async function sendOrderEmail(to: string, subject: string, text: string) {
  try {
    await sendEmail({ env, for: BACKGROUND, message: { to: [to], subject, text } });
  } catch (error) {
    console.warn("order email not sent", error instanceof Error ? error.message : error);
  }
}
