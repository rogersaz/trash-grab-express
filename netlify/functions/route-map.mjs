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

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const deltas = [];
    for (let coordinate = 0; coordinate < 2; coordinate += 1) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= encoded.length || shift > 30) {
          throw new Error('Invalid encoded polyline.');
        }
        byte = encoded.charCodeAt(index) - 63;
        index += 1;
        if (byte < 0 || byte > 63) throw new Error('Invalid encoded polyline.');
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      deltas.push((result & 1) ? ~(result >> 1) : (result >> 1));
    }
    latitude += deltas[0];
    longitude += deltas[1];
    points.push([latitude, longitude]);
  }
  return points;
}

function encodeSigned(value) {
  let encodedValue = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (encodedValue >= 0x20) {
    output += String.fromCharCode((0x20 | (encodedValue & 0x1f)) + 63);
    encodedValue >>= 5;
  }
  return output + String.fromCharCode(encodedValue + 63);
}

function encodePolyline(points) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let output = '';
  for (const [latitude, longitude] of points) {
    output += encodeSigned(latitude - previousLatitude);
    output += encodeSigned(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return output;
}

function samplePoints(points, targetCount) {
  if (points.length <= targetCount) return points;
  const sampled = [];
  for (let index = 0; index < targetCount; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (targetCount - 1));
    sampled.push(points[sourceIndex]);
  }
  return sampled;
}

function staticMapUrl(polyline, apiKey) {
  const params = new URLSearchParams({
    size: '640x360',
    scale: '2',
    format: 'png',
    maptype: 'roadmap',
    path: `weight:5|color:0x235340ff|enc:${polyline}`,
    key: apiKey
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

function reducePolylineForUrl(encoded, apiKey) {
  const fits = value => staticMapUrl(value, apiKey).length <= 15000;
  if (fits(encoded)) return encoded;

  const points = decodePolyline(encoded);
  if (points.length < 2) throw new Error('Route line must contain at least two points.');

  let targetCount = Math.max(2, Math.floor(points.length * 0.75));
  while (targetCount >= 2) {
    const candidate = encodePolyline(samplePoints(points, targetCount));
    if (fits(candidate)) return candidate;
    if (targetCount === 2) break;
    targetCount = Math.max(2, Math.floor(targetCount * 0.75));
  }
  throw new Error('Route line could not be reduced.');
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
  const adminResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/trash_grab_admins?${query}`,
    { headers }
  );
  if (!adminResponse.ok) return false;
  const admins = await adminResponse.json();
  return Array.isArray(admins) && admins.length === 1;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!(await authorizedAdmin(request))) {
    return json(401, { error: 'Administrator sign-in required.' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return json(503, { error: 'Google Maps is not configured.' });

  let input;
  try {
    input = await request.json();
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const polyline = input?.polyline;
  if (typeof polyline !== 'string' || polyline.length < 2 || polyline.length > 100000) {
    return json(400, { error: 'A valid route line is required.' });
  }

  let mapPolyline;
  try {
    mapPolyline = reducePolylineForUrl(polyline, apiKey);
  } catch {
    return json(400, { error: 'The route line could not be displayed.' });
  }

  if (mapPolyline.length < polyline.length) {
    console.info('Route line simplified', {
      originalLength: polyline.length,
      simplifiedLength: mapPolyline.length
    });
  }

  const mapResponse = await fetch(staticMapUrl(mapPolyline, apiKey));
  const contentType = mapResponse.headers.get('content-type') || '';

  if (!mapResponse.ok || !contentType.startsWith('image/')) {
    const googleMessage = await mapResponse.text().catch(() => '');
    console.error('Google static map failed', {
      status: mapResponse.status,
      contentType,
      message: googleMessage.slice(0, 500)
    });
    return json(502, {
      error: mapResponse.status === 403
        ? 'Google rejected the map request. Check that Maps Static API and billing are enabled for this API key.'
        : 'The embedded map could not be created. Please try again or use Open in Google Maps.'
    });
  }

  return new Response(await mapResponse.arrayBuffer(), {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'private, no-store',
      'content-disposition': 'inline; filename="pickup-route.png"'
    }
  });
}
