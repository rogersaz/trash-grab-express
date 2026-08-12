import { emailLayout, sendNotification } from './_email.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
  });
}

const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function siteUrl() {
  const configured = process.env.URL || process.env.SITE_URL || 'https://trashgrab.app';
  try {
    const url = new URL(configured);
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : 'https://trashgrab.app';
  } catch {
    return 'https://trashgrab.app';
  }
}

async function stripeRequest(path, options = {}) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY.trim()}`,
      'stripe-version': '2026-02-25.clover',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 2048) return json(413, { error: 'Request is too large.' });
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.RESEND_API_KEY?.trim()) {
    return json(503, { error: 'Billing access is not configured yet.' });
  }

  const body = await request.json().catch(() => null);
  const email = String(body?.email || '').trim().toLowerCase();
  const startedAt = Number(body?.startedAt);
  if (!body || body.website || !validEmail(email) || !Number.isFinite(startedAt) || Date.now() - startedAt < 2000) {
    return json(422, { error: 'Please enter the email used during checkout.' });
  }

  const genericSuccess = { sent: true, message: 'If that email has a Stripe billing account, a secure access link is on the way.' };
  const customers = await stripeRequest(`customers?${new URLSearchParams({ email, limit: '10' })}`);
  const matches = customers.response.ok ? customers.data?.data || [] : [];
  let customer = matches[0] || null;
  for (const candidate of matches) {
    const subscriptions = await stripeRequest(`subscriptions?${new URLSearchParams({ customer: candidate.id, status: 'all', limit: '5' })}`);
    const hasCurrentSubscription = subscriptions.response.ok && subscriptions.data?.data?.some(subscription =>
      ['active', 'trialing', 'past_due', 'unpaid', 'paused'].includes(subscription.status)
    );
    if (hasCurrentSubscription) {
      customer = candidate;
      break;
    }
  }
  if (!customer?.id) return json(200, genericSuccess);

  const portal = await stripeRequest('billing_portal/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ customer: customer.id, return_url: `${siteUrl()}/account.html` })
  });
  if (!portal.response.ok || !portal.data?.url) {
    console.error('Stripe billing portal session failed', { status: portal.response.status, type: portal.data?.error?.type, code: portal.data?.error?.code });
    return json(200, genericSuccess);
  }

  const bucket = Math.floor(Date.now() / 300000);
  await sendNotification({
    to: email,
    subject: 'Your secure Trash Grab Express billing link',
    idempotencyKey: `billing-portal-${customer.id}-${bucket}`,
    text: `Use this temporary Stripe link to manage your Trash Grab Express billing:\n\n${portal.data.url}\n\nThe link expires shortly. If you did not request it, you can ignore this email.`,
    html: emailLayout({
      heading: 'Your secure billing link is ready.',
      intro: 'Use this temporary Stripe link to update your payment method, view invoices, or manage a recurring subscription. If you did not request it, you can ignore this email.',
      ctaLabel: 'Open secure billing portal',
      ctaUrl: portal.data.url
    })
  });

  return json(200, genericSuccess);
}
