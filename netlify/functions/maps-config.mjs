const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store'
    }
  });
}

async function authorizedAdmin(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, authorization };
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  if (!user?.id) return false;
  const query = new URLSearchParams({
    user_id: `eq.${user.id}`,
    select: 'user_id',
    limit: '1'
  });
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/trash_grab_admins?${query}`, { headers });
  if (!adminResponse.ok) return false;
  const admins = await adminResponse.json();
  return Array.isArray(admins) && admins.length === 1;
}

export default async function handler(request) {
  if (request.method !== 'GET') return json(405, { error: 'Method not allowed.' });
  if (!(await authorizedAdmin(request))) return json(401, { error: 'Administrator sign-in required.' });

  const apiKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  if (!apiKey) return json(503, { error: 'Interactive Google Maps is not configured.' });
  return json(200, {
    apiKey,
    mapId: process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
  });
}
