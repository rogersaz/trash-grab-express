import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('public runner program explains approval, referrals, and the processing fee', async () => {
  const html = await readFile(projectFile('index.html'), 'utf8');
  assert.match(html, /id="runner-form"/);
  assert.match(html, /Black &amp; Blue Trash Bin Runner/);
  assert.match(html, /Every runner is reviewed before receiving routes/);
  assert.match(html, /\$4 processing fee/);
  assert.match(html, /does not guarantee approval, routes, or earnings/i);
  assert.match(html, /domain &amp; business concept available/i);
});

test('runner applications are submitted to the dedicated table', async () => {
  const script = await readFile(projectFile('script.js'), 'utf8');
  assert.match(script, /from\('trash_grab_runner_applications'\)/);
  assert.match(script, /age_18_or_older/);
  assert.match(script, /reliable_transportation/);
});

test('runner applications have a protected approval workflow', async () => {
  const [adminHtml, adminScript, migration] = await Promise.all([
    readFile(projectFile('admin.html'), 'utf8'),
    readFile(projectFile('admin.js'), 'utf8'),
    readFile(projectFile('supabase/migrations/20260731151427_create_trash_grab_runner_applications.sql'), 'utf8')
  ]);

  assert.match(adminHtml, /id="runner-approvals"/);
  assert.match(adminScript, /loadRunnerApplications/);
  assert.match(adminScript, /reviewed_by: currentUser\.id/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /Visitors can apply to become Trash Grab runners/);
  assert.match(migration, /Trash Grab admins can read runner applications/);
  assert.match(migration, /grant insert \(/i);
  assert.doesNotMatch(migration, /grant select[^;]+to anon/i);
  assert.doesNotMatch(migration, /grant update[^;]+to anon/i);
});
