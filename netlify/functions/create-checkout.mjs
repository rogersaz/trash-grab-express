const PLAN_PRICES = {
  weekly: { base: 22, extraBin: 6, returnFee: 6, label: 'Weekly curb-and-return service', recurring: true },
  biweekly: { base: 15, extraBin: 4, returnFee: 4, label: 'Every-other-week curb-and-return service', recurring: true },
  once: { base: 18, extraBin: 5, returnFee: 5, label: 'One-time curb service', recurring: false }
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store'
    }
  });
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function checkoutPlan({ frequency, bins, returns }) {
  const plan = PLAN_PRICES[frequency];
  const binCount = Number(bins);
  if (!plan || !Number.isInteger(binCount) || binCount < 1 || binCount > 3 || typeof returns !== 'boolean') {
    return null;
  }
  const dollars = plan.base + ((binCount - 1) * plan.extraBin) + (returns ? plan.returnFee : 0);
  return { ...plan, frequency, bins: binCount, returns, amount: dollars * 100 };
}

function siteUrl() {
  const configured = process.env.URL || process.env.SITE_URL || 'https://trashgrab.app';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error();
    return url.origin;
  } catch {
    return 'https://trashgrab.app';
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 4096) {
    return json(413, { error: 'Request is too large.' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) return json(503, { error: 'Secure online payment is not configured yet.' });

  const body = await request.json().catch(() => null);
  const plan = body && checkoutPlan(body);
  if (!body || !validEmail(body.email) || !plan || !/^[0-9a-f-]{36}$/i.test(body.checkoutToken || '')) {
    return json(422, { error: plan ? 'Please check your booking details.' : 'Online payment for this plan requires a custom quote.' });
  }

  const origin = siteUrl();
  const params = new URLSearchParams({
    mode: plan.recurring ? 'subscription' : 'payment',
    'managed_payments[enabled]': 'false',
    customer_email: body.email,
    success_url: `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}#book`,
    cancel_url: `${origin}/?payment=cancelled#book`,
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(plan.amount),
    'line_items[0][price_data][product_data][name]': plan.label,
    'line_items[0][price_data][product_data][description]': `${plan.bins} ${plan.bins === 1 ? 'bin' : 'bins'}${plan.returns ? ' with post-collection return' : ''}`,
    'metadata[plan_frequency]': plan.frequency,
    'metadata[bin_count]': String(plan.bins),
    'metadata[return_service]': String(plan.returns)
  });
  if (plan.recurring) params.set('line_items[0][price_data][recurring][interval]', 'month');

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${stripeSecretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2026-02-25.clover',
      'idempotency-key': `trash-grab-${body.checkoutToken}`
    },
    body: params
  });
  const checkout = await stripeResponse.json().catch(() => ({}));
  if (!stripeResponse.ok || !checkout.url) {
    console.error('Stripe Checkout session creation failed', { type: checkout?.error?.type, code: checkout?.error?.code });
    return json(502, { error: 'Secure checkout is temporarily unavailable. No payment was taken.' });
  }

  return json(200, { url: checkout.url });
}
