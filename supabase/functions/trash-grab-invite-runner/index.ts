import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const allowedOrigins = new Set([
  'https://trashgrab.app',
  'https://www.trashgrab.app',
  'http://localhost:8888',
  'http://localhost:3000',
])

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://trashgrab.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(request: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json(request, 405, { error: 'Method not allowed.' })
  }

  const origin = request.headers.get('origin')
  if (origin && !allowedOrigins.has(origin)) {
    return json(request, 403, { error: 'Origin not allowed.' })
  }

  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) {
    return json(request, 401, { error: 'Administrator sign-in required.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json(request, 503, { error: 'Runner invitations are not configured.' })
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = authorization.slice('Bearer '.length)
  const { data: userData, error: userError } = await callerClient.auth.getUser(token)
  const caller = userData.user
  if (userError || !caller) {
    return json(request, 401, { error: 'Administrator session is invalid.' })
  }

  const { data: admin, error: adminError } = await callerClient
    .from('trash_grab_admins')
    .select('user_id')
    .eq('user_id', caller.id)
    .eq('active', true)
    .maybeSingle()
  if (adminError || !admin) {
    return json(request, 403, { error: 'Administrator access is required.' })
  }

  let input: { applicationId?: unknown }
  try {
    input = await request.json()
  } catch {
    return json(request, 400, { error: 'Invalid request.' })
  }
  if (!validUuid(input.applicationId)) {
    return json(request, 400, { error: 'A valid runner application is required.' })
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: application, error: applicationError } = await serviceClient
    .from('trash_grab_runner_applications')
    .select('id, first_name, last_name, email, status')
    .eq('id', input.applicationId)
    .eq('status', 'approved')
    .maybeSingle()
  if (applicationError || !application) {
    return json(request, 409, { error: 'Approve this runner before sending portal access.' })
  }

  const { data: runner, error: runnerError } = await serviceClient
    .from('trash_grab_runners')
    .select('id, auth_user_id, active, invited_at')
    .eq('application_id', application.id)
    .maybeSingle()
  if (runnerError || !runner?.active) {
    return json(request, 409, { error: 'The approved runner profile is not active.' })
  }

  if (runner.auth_user_id) {
    return json(request, 200, {
      message: 'This runner account is already linked.',
      accountLinked: true,
      invitedAt: runner.invited_at,
    })
  }

  const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    application.email.toLowerCase(),
    {
      redirectTo: 'https://trashgrab.app/runner.html',
      data: {
        display_name: `${application.first_name} ${application.last_name}`,
        program: 'black_blue_runner',
      },
    },
  )
  if (inviteError || !inviteData.user) {
    console.error('Runner invitation failed', {
      code: inviteError?.code,
      message: inviteError?.message,
      applicationId: application.id,
    })
    return json(request, 502, {
      error: 'The invitation email could not be sent. Confirm the runner email and try again.',
    })
  }

  const invitedAt = new Date().toISOString()
  const { error: updateError } = await serviceClient
    .from('trash_grab_runners')
    .update({ invited_at: invitedAt, updated_at: invitedAt })
    .eq('id', runner.id)
  if (updateError) {
    console.error('Runner invitation status could not be saved', {
      code: updateError.code,
      message: updateError.message,
      runnerId: runner.id,
    })
  }

  return json(request, 200, {
    message: 'Runner invitation sent.',
    accountLinked: true,
    invitedAt,
  })
})
