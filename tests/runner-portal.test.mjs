import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('approved runners have a personal passwordless route portal', async () => {
  const [html, script, config] = await Promise.all([
    readFile(projectFile('runner.html'), 'utf8'),
    readFile(projectFile('runner.js'), 'utf8'),
    readFile(projectFile('netlify.toml'), 'utf8')
  ]);

  assert.match(html, /id="runner-login-form"/);
  assert.match(html, /id="runner-map"/);
  assert.match(html, /id="runner-stop-list"/);
  assert.match(script, /signInWithOtp/);
  assert.match(script, /shouldCreateUser:\s*false/);
  assert.match(script, /from\('trash_grab_runners'\)/);
  assert.match(script, /from\('trash_grab_runner_assignments'\)/);
  assert.doesNotMatch(script, /from\('trash_grab_service_requests'\)/);
  assert.match(config, /runner\.html runner\.css runner\.js/);
});

test('runner assignment schema enforces per-runner read access without customer contact fields', async () => {
  const [migration, policyMigration] = await Promise.all([
    readFile(
      projectFile('supabase/migrations/20260731235114_create_trash_grab_runner_portal.sql'),
      'utf8'
    ),
    readFile(
      projectFile('supabase/migrations/20260731235842_optimize_runner_access_policies.sql'),
      'utf8'
    )
  ]);
  const assignmentTable = migration.match(
    /create table if not exists public\.trash_grab_runner_assignments \(([\s\S]*?)\n\);/
  )?.[1] || '';

  assert.match(migration, /alter table public\.trash_grab_runner_assignments enable row level security/i);
  assert.match(policyMigration, /Admins and runners view permitted assignments/);
  assert.match(policyMigration, /trash_grab_is_active_runner\(runner_id\)/);
  assert.match(policyMigration, /Trash Grab admins insert runner assignments/);
  assert.match(migration, /auth_user_id = \(select auth\.uid\(\)\)/);
  assert.match(assignmentTable, /pickup_date date not null/);
  assert.match(assignmentTable, /service_address text not null/);
  assert.match(assignmentTable, /runner_notes text/);
  assert.doesNotMatch(assignmentTable, /\bemail\b/i);
  assert.doesNotMatch(assignmentTable, /\bphone\b/i);
  assert.doesNotMatch(assignmentTable, /admin_notes/i);
});

test('runner invitations are admin verified and keep the service role server-side', async () => {
  const [adminHtml, adminScript, invitationFunction] = await Promise.all([
    readFile(projectFile('admin.html'), 'utf8'),
    readFile(projectFile('admin.js'), 'utf8'),
    readFile(projectFile('supabase/functions/trash-grab-invite-runner/index.ts'), 'utf8')
  ]);

  assert.match(adminHtml, /id="runner-access-section"/);
  assert.match(adminHtml, /id="runner-assignment-form"/);
  assert.match(adminScript, /functions\.invoke\('trash-grab-invite-runner'/);
  assert.match(adminScript, /from\('trash_grab_runner_assignments'\)\s*\n\s*\.insert/);
  assert.match(invitationFunction, /from\('trash_grab_admins'\)/);
  assert.match(invitationFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(invitationFunction, /auth\.admin\.inviteUserByEmail/);
  assert.match(invitationFunction, /\.eq\('status', 'approved'\)/);
  assert.doesNotMatch(adminScript, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(invitationFunction, /eyJhbGciOiJIUzI1Ni/);
});

test('map configuration accepts an authenticated active runner but route optimization stays admin-only', async () => {
  const [mapsConfig, optimizer] = await Promise.all([
    readFile(projectFile('netlify/functions/maps-config.mjs'), 'utf8'),
    readFile(projectFile('netlify/functions/optimize-route.mjs'), 'utf8')
  ]);

  assert.match(mapsConfig, /trash_grab_runners/);
  assert.match(mapsConfig, /auth_user_id/);
  assert.match(mapsConfig, /active: 'eq\.true'/);
  assert.doesNotMatch(optimizer, /trash_grab_runners/);
  assert.match(optimizer, /Administrator sign-in required/);
});
