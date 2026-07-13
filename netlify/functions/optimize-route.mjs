const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function validAddress(value) {
  return typeof value === 'string' && value.trim().length >= 5 && value.length <= 300;
}

async function authorizedAdmin(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;

  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    authorization
  };
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  if (!user?.id) return false;

  const query = new URLSearchParams({
    user_id: `eq.${user.id}`,
    select: 'user_id',
    limit: '1'
  });
  const adminResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/trash_grab_admins?${query}`,
    { headers }
  );
  if (!adminResponse.ok) return false;
  const admins = await adminResponse.json();
  return Array.isArray(admins) && admins.length === 1;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  if (!(await authorizedAdmin(request))) {
    return json(401, { error: 'Administrator sign-in required.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return json(503, { error: 'Google Maps is not configured.' });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const home = input?.home?.trim();
  const stops = Array.isArray(input?.stops) ? input.stops.map(stop => stop.trim()) : [];
  const returnHome = input?.returnHome !== false;

  if (!validAddress(home) || stops.length < 1 || stops.length > 8 || !stops.every(validAddress)) {
    return json(400, { error: 'Provide a home address and between 1 and 8 valid stops.' });
  }

  const destination = returnHome ? home : stops[stops.length - 1];
  const intermediateStops = returnHome ? stops : stops.slice(0, -1);
  const requestBody = {
    origin: { address: home },
    destination: { address: destination },
    intermediates: intermediateStops.map(address => ({ address })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    optimizeWaypointOrder: intermediateStops.length > 0,
    polylineQuality: 'OVERVIEW',
    polylineEncoding: 'ENCODED_POLYLINE'
  };

  const googleResponse = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify(requestBody)
    }
  );

  const googleData = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok) {
    console.error('Google route optimization failed', {
      status: googleResponse.status,
      message: googleData?.error?.message
    });
    return json(502, {
      error: 'Google could not optimize this route. Check that the Routes API is enabled and each address is valid.'
    });
  }

  const route = googleData?.routes?.[0];
  const optimized = route?.optimizedIntermediateWaypointIndex;
  if (!route || (stops.length > 1 && !Array.isArray(optimized))) {
    return json(502, { error: 'Google did not return an optimized route.' });
  }

  const order = stops.length === 1
    ? [0]
    : returnHome
      ? optimized
      : [...optimized, stops.length - 1];

  return json(200, {
    order,
    distanceMeters: route.distanceMeters ?? null,
    duration: route.duration ?? null,
    polyline: route.polyline?.encodedPolyline ?? null
  });
}
