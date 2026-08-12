import test from 'node:test';
import assert from 'node:assert/strict';

import mapsConfigHandler from '../netlify/functions/maps-config.mjs';
import optimizeRouteHandler from '../netlify/functions/optimize-route.mjs';
import routeMapHandler from '../netlify/functions/route-map.mjs';
import createCheckoutHandler, { checkoutPlan } from '../netlify/functions/create-checkout.mjs';
import contactHandler from '../netlify/functions/contact.mjs';
import notifyServiceRequestHandler from '../netlify/functions/notify-service-request.mjs';
import stripeWebhookHandler, { validStripeSignature } from '../netlify/functions/stripe-webhook.mjs';
import { createHmac } from 'node:crypto';

test('map functions reject unauthenticated requests', async () => {
  const configResponse = await mapsConfigHandler(new Request('https://trashgrab.app/.netlify/functions/maps-config'));
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route', {
    method: 'POST'
  }));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map', {
    method: 'POST'
  }));

  assert.equal(configResponse.status, 401);
  assert.equal(optimizeResponse.status, 401);
  assert.equal(mapResponse.status, 401);
});

test('route functions reject oversized request bodies before processing', async () => {
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route', {
    method: 'POST',
    headers: { 'content-length': '20001' }
  }));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map', {
    method: 'POST',
    headers: { 'content-length': '150001' }
  }));

  assert.equal(optimizeResponse.status, 413);
  assert.equal(mapResponse.status, 413);
});

test('map functions reject unsupported methods', async () => {
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route'));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map'));

  assert.equal(optimizeResponse.status, 405);
  assert.equal(mapResponse.status, 405);
});

test('checkout pricing is calculated on the server from allowlisted plan options', () => {
  assert.equal(checkoutPlan({ frequency: 'weekly', bins: 1, returns: true }).amount, 2800);
  assert.equal(checkoutPlan({ frequency: 'biweekly', bins: 3, returns: false }).amount, 2300);
  assert.equal(checkoutPlan({ frequency: 'once', bins: 2, returns: true }).amount, 2800);
  assert.equal(checkoutPlan({ frequency: 'weekly', bins: 4, returns: true }), null);
  assert.equal(checkoutPlan({ frequency: 'tampered', bins: 1, returns: true }), null);
});

test('checkout function rejects unsupported methods and oversized bodies', async () => {
  const methodResponse = await createCheckoutHandler(new Request('https://trashgrab.app/.netlify/functions/create-checkout'));
  const sizeResponse = await createCheckoutHandler(new Request('https://trashgrab.app/.netlify/functions/create-checkout', {
    method: 'POST',
    headers: { 'content-length': '4097' }
  }));

  assert.equal(methodResponse.status, 405);
  assert.equal(sizeResponse.status, 413);
});

test('public email functions enforce methods, body limits, and spam checks', async () => {
  const contactMethod = await contactHandler(new Request('https://trashgrab.app/.netlify/functions/contact'));
  const contactSize = await contactHandler(new Request('https://trashgrab.app/.netlify/functions/contact', {
    method: 'POST',
    headers: { 'content-length': '8193' }
  }));
  const contactSpam = await contactHandler(new Request('https://trashgrab.app/.netlify/functions/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ website: 'spam.example' })
  }));
  const notifyMethod = await notifyServiceRequestHandler(new Request('https://trashgrab.app/.netlify/functions/notify-service-request'));

  assert.equal(contactMethod.status, 405);
  assert.equal(contactSize.status, 413);
  assert.equal(contactSpam.status, 422);
  assert.equal(notifyMethod.status, 405);
});

test('Stripe webhook signatures are time-bound and verified', async () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
  const timestamp = 1_800_000_000;
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

  assert.equal(await validStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.equal(await validStripeSignature(payload, `t=${timestamp},v1=bad`, secret, timestamp), false);
  assert.equal(await validStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret, timestamp + 301), false);
});

test('Stripe webhook rejects unsigned requests', async () => {
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  try {
    const response = await stripeWebhookHandler(new Request('https://trashgrab.app/.netlify/functions/stripe-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    }));
    assert.equal(response.status, 400);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});
