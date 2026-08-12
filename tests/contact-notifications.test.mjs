import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('site includes an accessible contact form wired to the email function', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('script.js', root), 'utf8')
  ]);

  assert.match(html, /id="contact-form"/);
  assert.match(html, /name="website"/);
  assert.match(html, /id="contact-form-status" role="status"/);
  assert.match(script, /\.netlify\/functions\/contact/);
  assert.match(script, /startedAt: contactStartedAt/);
});

test('bookings carry their saved request ID into notifications and Stripe Checkout', async () => {
  const [script, checkout] = await Promise.all([
    readFile(new URL('script.js', root), 'utf8'),
    readFile(new URL('netlify/functions/create-checkout.mjs', root), 'utf8')
  ]);

  assert.match(script, /id: crypto\.randomUUID\(\)/);
  assert.match(script, /notify-service-request/);
  assert.match(script, /requestId: request\.id/);
  assert.match(checkout, /metadata\[request_id\]/);
  assert.match(checkout, /subscription_data\[metadata\]\[request_id\]/);
  assert.match(checkout, /customer_creation: 'always'/);
});

test('customer care pages and confirmation emails are present', async () => {
  const [home, account, accountScript, privacy, terms, cancellation, refund, serviceNotification, paymentWebhook] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('account.html', root), 'utf8'),
    readFile(new URL('account.js', root), 'utf8'),
    readFile(new URL('privacy.html', root), 'utf8'),
    readFile(new URL('terms.html', root), 'utf8'),
    readFile(new URL('cancellation.html', root), 'utf8'),
    readFile(new URL('refund.html', root), 'utf8'),
    readFile(new URL('netlify/functions/notify-service-request.mjs', root), 'utf8'),
    readFile(new URL('netlify/functions/stripe-webhook.mjs', root), 'utf8')
  ]);

  assert.match(home, /href="\/account\.html"/);
  assert.match(home, /agree to the <a href="\/terms\.html"/);
  assert.match(account, /id="billing-portal-form"/);
  assert.match(accountScript, /request-billing-portal/);
  assert.match(privacy, /Privacy Policy/);
  assert.match(terms, /Recurring plans renew monthly until canceled/);
  assert.match(cancellation, /Stripe billing portal/);
  assert.match(refund, /Refund Policy/);
  assert.match(serviceNotification, /to: service\.email/);
  assert.match(paymentWebhook, /stripe-customer-/);
});
