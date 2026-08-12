import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('admin can see and update payment status independently from service status', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(projectFile('admin.html'), 'utf8'),
    readFile(projectFile('admin.js'), 'utf8'),
    readFile(projectFile('admin.css'), 'utf8')
  ]);

  assert.match(html, /<th>Service status<\/th><th>Payment<\/th>/);
  assert.match(html, /name="paymentStatus"/);
  assert.match(html, /value="unpaid">UNPAID<\/option>/);
  assert.match(html, /value="paid">PAID<\/option>/);
  assert.match(script, /payment_status: nextPaymentStatus/);
  assert.match(script, /paid_at: nextPaymentStatus === 'paid'/);
  assert.match(styles, /\.payment-paid\{background:#187148;/);
  assert.match(styles, /\.payment-unpaid\{background:#c62828;/);
});

test('new customer requests cannot mark themselves paid', async () => {
  const migration = await readFile(
    projectFile('supabase/migrations/20260812000000_add_service_request_payment_status.sql'),
    'utf8'
  );

  assert.match(migration, /payment_status text not null default 'unpaid'/);
  assert.match(migration, /check \(payment_status in \('paid', 'unpaid'\)\)/);
  assert.match(migration, /and payment_status = 'unpaid'/);
  assert.match(migration, /and paid_at is null/);
});
