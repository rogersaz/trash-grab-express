import { emailLayout, money, sendNotification } from './_email.mjs';
import { updatePaymentStatus } from './_supabase-server.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
  });
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function validStripeSignature(payload, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || !signatureHeader || !secret) return false;
  const entries = signatureHeader.split(',').map(item => item.trim().split('='));
  const timestamp = Number(entries.find(([key]) => key === 't')?.[1]);
  const signatures = entries.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || signatures.length === 0) return false;
  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  return signatures.some(signature => constantTimeEqual(signature, expected));
}

function metadataFor(object) {
  const candidates = [
    object?.metadata,
    object?.parent?.subscription_details?.metadata,
    object?.subscription_details?.metadata,
    object?.lines?.data?.[0]?.metadata
  ];
  return candidates.find(metadata => metadata?.request_id) || {};
}

function paymentDetails(event) {
  const object = event?.data?.object || {};
  const metadata = metadataFor(object);
  return {
    requestId: metadata.request_id,
    email: object.customer_details?.email || object.customer_email || object.customer_email_address || '',
    amount: object.amount_total ?? object.amount_paid ?? object.amount_due ?? 0,
    currency: object.currency || 'usd',
    stripeId: object.id || '',
    billingReason: object.billing_reason || '',
    metadata
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 262144) return json(413, { error: 'Request is too large.' });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return json(503, { error: 'Webhook is not configured.' });
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  if (!(await validStripeSignature(payload, signature, webhookSecret))) return json(400, { error: 'Invalid signature.' });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: 'Invalid JSON payload.' });
  }
  const details = paymentDetails(event);
  const successEvent = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
    || (event.type === 'invoice.paid' && details.billingReason !== 'subscription_create');
  const failedEvent = event.type === 'invoice.payment_failed';
  if ((!successEvent && !failedEvent) || !details.requestId) return json(200, { received: true });

  const paidAt = successEvent ? new Date(event.created * 1000).toISOString() : null;
  const service = await updatePaymentStatus(details.requestId, successEvent ? 'paid' : 'unpaid', paidAt);
  if (!service) return json(500, { error: 'Payment record could not be updated.' });

  const paid = successEvent;
  await Promise.all([sendNotification({
    subject: paid
      ? `PAID — ${service.first_name} ${service.last_name} — ${money(details.amount, details.currency)}`
      : `PAYMENT FAILED — ${service.first_name} ${service.last_name}`,
    replyTo: service.email,
    idempotencyKey: `stripe-${event.id}`,
    text: [
      paid ? 'TRASH GRAB EXPRESS PAYMENT RECEIVED' : 'TRASH GRAB EXPRESS PAYMENT FAILED',
      '',
      `Customer: ${service.first_name} ${service.last_name}`,
      `Email: ${service.email}`,
      `Amount: ${money(details.amount, details.currency)}`,
      `Plan: ${service.plan_frequency}`,
      `Bins: ${service.bin_count}`,
      `Stripe record: ${details.stripeId}`,
      `Admin payment status: ${paid ? 'PAID' : 'UNPAID'}`,
      '',
      'Open admin: https://trashgrab.app/admin.html'
    ].join('\n')
  }), sendNotification({
    to: service.email,
    subject: paid
      ? `Payment received — ${money(details.amount, details.currency)}`
      : 'Action needed — Trash Grab Express payment failed',
    idempotencyKey: `stripe-customer-${event.id}`,
    text: [
      `Hi ${service.first_name},`,
      '',
      paid ? 'Your Trash Grab Express payment was received.' : 'We could not process your Trash Grab Express payment.',
      `Amount: ${money(details.amount, details.currency)}`,
      `Plan: ${service.plan_frequency}`,
      '',
      paid ? 'Manage billing: https://trashgrab.app/account.html' : 'Please update your payment method: https://trashgrab.app/account.html'
    ].join('\n'),
    html: emailLayout({
      heading: paid ? 'Payment received.' : 'Your payment needs attention.',
      intro: paid
        ? `Thanks, ${service.first_name}. Your Trash Grab Express payment was successful.`
        : `Hi ${service.first_name}. We could not process your latest payment. Use the secure billing portal to update your payment method.`,
      details: [
        ['Amount', money(details.amount, details.currency)],
        ['Plan', service.plan_frequency],
        ['Status', paid ? 'PAID' : 'UNPAID']
      ],
      ctaLabel: paid ? 'View receipts and billing' : 'Update payment method',
      ctaUrl: 'https://trashgrab.app/account.html'
    })
  })]);

  return json(200, { received: true });
}
