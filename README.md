# Trash Grab Express

A responsive service website with a Supabase-backed customer-request system and protected admin dashboard.

[Open the live website](https://trashgrab.app) · [Open the admin dashboard](https://trashgrab.app/admin.html) · [Read the colorful dashboard guide](https://trashgrab.app/docs/dashboard-user-guide.html)

## Included

- responsive landing page and mobile navigation
- instant service-price estimator
- customer requests saved to Supabase
- protected admin login and request-management dashboard
- status filters, private admin notes, and request updates
- Google Route Optimization API with automatic Routes waypoint-optimization fallback
- up to 25 selected pickups with optimized stopping order
- interactive Google map with numbered stops, customer names, addresses, and a Google Maps navigation handoff
- Row Level Security protecting customer data
- accessible FAQ accordion and motion preferences
- baseline browser security headers
- colorful, printable administrator handbook linked directly from the dashboard

## Admin

The dashboard is available at `/admin.html`. A Supabase Auth user must also be explicitly added to `public.trash_grab_admins`; having an account alone does not grant access.

## Security model

Anonymous visitors can insert service requests but cannot read any request rows. Only active allowlisted admins can read or update requests. Never place a Supabase service-role or secret key in this repository.

## Google route configuration

Set these private environment variables in Netlify:

- `GOOGLE_MAPS_API_KEY` — server-only key for Routes, Geocoding, and Maps Static fallback requests.
- `GOOGLE_MAPS_BROWSER_API_KEY` — separate browser key restricted to `https://trashgrab.app/*` and only the Maps JavaScript API.
- `GOOGLE_MAPS_MAP_ID` — optional production map ID for advanced map markers.
- `GOOGLE_CLOUD_PROJECT_ID` — Google Cloud project containing the Route Optimization API.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — service account allowed to call Route Optimization.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — private key belonging to that service account.

The service account needs the least-privilege Route Optimization permission (`routeoptimization.locations.use`). Never reuse the browser key for server requests, commit a service-account key, or expose a private key in site JavaScript.

If the three service-account settings are not present or the advanced optimizer is temporarily unavailable, route building automatically falls back to Routes API waypoint optimization. If the browser key is not present, the dashboard automatically displays the existing static map preview.
