import { createSign } from 'node:crypto';

const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';
const MAX_STOPS = 25;

let cachedGoogleToken = null;
let cachedGoogleTokenExpiresAt = 0;

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

function serviceAccountConfig() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return projectId && clientEmail && privateKey
    ? { projectId, clientEmail, privateKey }
    : null;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken(config) {
  if (cachedGoogleToken && Date.now() < cachedGoogleTokenExpiresAt - 60_000) {
    return cachedGoogleToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsignedToken = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const assertion = `${unsignedToken}.${signer.sign(config.privateKey).toString('base64url')}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || 'Google service account authorization failed.');
  }

  cachedGoogleToken = tokenData.access_token;
  cachedGoogleTokenExpiresAt = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
  return cachedGoogleToken;
}

async function geocodeAddress(address, apiKey) {
  const params = new URLSearchParams({ address, key: apiKey });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  const result = await response.json().catch(() => ({}));
  const match = result.results?.[0];
  const location = match?.geometry?.location;
  if (!response.ok || result.status !== 'OK' || !match?.place_id || !location) {
    throw new Error(`Google could not locate: ${address}`);
  }
  return {
    address,
    placeId: match.place_id,
    location: { lat: location.lat, lng: location.lng }
  };
}

function sumDurationSeconds(values) {
  return values.reduce((total, value) => {
    const seconds = Number.parseFloat(String(value || '').replace('s', ''));
    return total + (Number.isFinite(seconds) ? seconds : 0);
  }, 0);
}

async function optimizeWithRouteOptimization({ home, stops, returnHome, apiKey, config }) {
  const geocoded = await Promise.all([home, ...stops].map(address => geocodeAddress(address, apiKey)));
  const [homePoint, ...stopPoints] = geocoded;
  const accessToken = await googleAccessToken(config);

  const vehicle = {
    label: 'trash-grab-vehicle',
    displayName: 'Trash Grab Express pickup vehicle',
    travelMode: 'DRIVING',
    startWaypoint: { placeId: homePoint.placeId },
    costPerTraveledHour: 1
  };
  if (returnHome) vehicle.endWaypoint = { placeId: homePoint.placeId };

  const body = {
    timeout: '12s',
    considerRoadTraffic: true,
    populatePolylines: true,
    populateTransitionPolylines: true,
    model: {
      shipments: stopPoints.map((point, index) => ({
        label: `stop-${index}`,
        displayName: stops[index].slice(0, 63),
        pickups: [{
          arrivalWaypoint: { placeId: point.placeId },
          duration: '300s',
          label: `stop-${index}`
        }],
        penaltyCost: 100000
      })),
      vehicles: [vehicle]
    }
  };

  const response = await fetch(
    `https://routeoptimization.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/locations/global:optimizeTours`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Google Route Optimization API rejected the route.');
  }
  if (result.skippedShipments?.length) {
    throw new Error('Google could not include every selected pickup in this route.');
  }

  const route = result.routes?.[0];
  const order = route?.visits?.map(visit => visit.shipmentIndex);
  if (!route || !Array.isArray(order) || order.length !== stops.length) {
    throw new Error('Google Route Optimization API returned an incomplete stop order.');
  }

  const transitions = route.transitions || [];
  const durationSeconds = sumDurationSeconds(transitions.map(item => item.totalDuration));
  const distanceMeters = transitions.reduce(
    (total, item) => total + Number(item.travelDistanceMeters || 0),
    0
  );

  return {
    order,
    distanceMeters: route.metrics?.travelDistanceMeters ?? distanceMeters,
    duration: route.metrics?.totalDuration || `${Math.round(durationSeconds)}s`,
    polyline: route.routePolyline?.points || null,
    homeLocation: homePoint.location,
    stopLocations: order.map(index => stopPoints[index].location),
    optimizer: 'route-optimization'
  };
}

async function optimizeWithRoutes({ home, stops, returnHome, apiKey }) {
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

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'routes.optimizedIntermediateWaypointIndex',
        'routes.distanceMeters',
        'routes.duration',
        'routes.polyline.encodedPolyline',
        'routes.legs.startLocation',
        'routes.legs.endLocation'
      ].join(',')
    },
    body: JSON.stringify(requestBody)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || 'Google Routes API could not optimize this route.');
  }

  const route = result.routes?.[0];
  const optimized = route?.optimizedIntermediateWaypointIndex;
  if (!route || (stops.length > 1 && intermediateStops.length && !Array.isArray(optimized))) {
    throw new Error('Google Routes API did not return an optimized route.');
  }
  const order = stops.length === 1
    ? [0]
    : returnHome
      ? optimized
      : [...optimized, stops.length - 1];
  const legs = route.legs || [];
  const homeLatLng = legs[0]?.startLocation?.latLng;
  const stopLocations = legs.slice(0, stops.length).map(leg => leg.endLocation?.latLng);

  return {
    order,
    distanceMeters: route.distanceMeters ?? null,
    duration: route.duration ?? null,
    polyline: route.polyline?.encodedPolyline ?? null,
    homeLocation: homeLatLng
      ? { lat: homeLatLng.latitude, lng: homeLatLng.longitude }
      : null,
    stopLocations: stopLocations.map(point => point
      ? { lat: point.latitude, lng: point.longitude }
      : null),
    optimizer: 'waypoint-optimization'
  };
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

  const home = input?.home?.trim();
  const stops = Array.isArray(input?.stops) ? input.stops.map(stop => stop.trim()) : [];
  const returnHome = input?.returnHome !== false;
  if (!validAddress(home) || stops.length < 1 || stops.length > MAX_STOPS || !stops.every(validAddress)) {
    return json(400, { error: `Provide a home address and between 1 and ${MAX_STOPS} valid stops.` });
  }

  const advancedConfig = serviceAccountConfig();
  if (advancedConfig) {
    try {
      return json(200, await optimizeWithRouteOptimization({
        home, stops, returnHome, apiKey, config: advancedConfig
      }));
    } catch (error) {
      console.warn('Route Optimization API unavailable; using waypoint optimization', {
        message: error.message
      });
    }
  }

  try {
    const result = await optimizeWithRoutes({ home, stops, returnHome, apiKey });
    return json(200, {
      ...result,
      fallback: Boolean(advancedConfig)
    });
  } catch (error) {
    console.error('Google route planning failed', { message: error.message });
    return json(502, {
      error: 'Google could not optimize this route. Confirm that the Google APIs are enabled and every address is valid.'
    });
  }
}

export { MAX_STOPS, sumDurationSeconds };
