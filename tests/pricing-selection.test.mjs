import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('estimator starts at zero with no plan choices preselected', async () => {
  const [html, script] = await Promise.all([
    readFile(projectFile('index.html'), 'utf8'),
    readFile(projectFile('script.js'), 'utf8')
  ]);

  assert.match(html, /id="estimate-price">0<\/strong>/);
  assert.doesNotMatch(html, /data-value="1" class="active"/);
  assert.doesNotMatch(html, /name="frequency"[^>]*checked/);
  assert.doesNotMatch(html, /id="return-service"[^>]*checked/);
  assert.match(script, /const state = \{ bins: null, frequency: null, returns: false \}/);
});

test('checkout shows the selected plan and blocks incomplete estimates', async () => {
  const [html, script, styles] = await Promise.all([
    readFile(projectFile('index.html'), 'utf8'),
    readFile(projectFile('script.js'), 'utf8'),
    readFile(projectFile('styles.css'), 'utf8')
  ]);

  assert.match(html, /id="checkout-plan-summary"/);
  assert.match(html, /id="checkout-plan-frequency"/);
  assert.match(html, /id="checkout-plan-bins"/);
  assert.match(html, /id="checkout-plan-return"/);
  assert.match(html, /id="checkout-plan-price">\$0<\/strong>/);
  assert.match(script, /if \(!estimateIsComplete\(\)\)/);
  assert.match(script, /Please choose your bin count and service schedule before continuing to Stripe\./);
  assert.match(styles, /\.checkout-plan-heading>strong\{[^}]*color:#fff;[^}]*background:#c62828;/);
});
