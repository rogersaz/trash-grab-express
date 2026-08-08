# Trash Grab Express

A responsive service website with a Supabase-backed customer-request system and protected admin dashboard.

[Open the live website](https://trashgrab.app) · [Open the admin dashboard](https://trashgrab.app/admin.html) · [Read the colorful dashboard guide](https://trashgrab.app/docs/dashboard-user-guide.html)

## Included

- responsive landing page and mobile navigation
- instant service-price estimator
- Stripe-hosted Book & Pay checkout for one-time and monthly recurring plans
- customer requests saved to Supabase
- public Black & Blue Trash Bin Runner application and referral-interest form
- protected admin login and request-management dashboard
- admin-only runner application review and approval queue
- personal magic-link runner portal showing only each approved runner's assigned pickup dates, addresses, map stops, and runner-safe notes
- administrator controls for sending runner invitations and assigning or removing pickup stops
- status filters, private admin notes, and request updates
- Google Route Optimization API with automatic Routes waypoint-optimization fallback
- up to 25 selected pickups with optimized stopping order
- interactive Google map with numbered stops, customer names, addresses, and a Google Maps navigation handoff
- Row Level Security protecting customer data
- accessible FAQ accordion and motion preferences
- baseline browser security headers
- strict Content Security Policy, HTTPS enforcement, clickjacking protection, and pinned CDN integrity
- colorful, printable administrator handbook linked directly from the dashboard

## Admin

The dashboard is available at `/admin.html`. A Supabase Auth user must also be explicitly added to `public.trash_grab_admins`; having an account alone does not grant access. Approved administrators can review runner applications, approve a runner, send the secure portal invitation, and assign runner-safe pickup snapshots.

Approved runners use `/runner.html`. The portal sends a passwordless magic link only to an existing invited account. Each runner can read only their own active assignments through Row Level Security. Assignment snapshots intentionally omit customer email, phone, customer notes, and private administrator notes.

The runner program is presented as an application, not a promise of employment or guaranteed earnings. Each referred household's monthly price includes a $4 processing fee; route pay, referral commissions, eligibility, and payment timing belong in the separate runner agreement.

## Security model

Anonymous visitors can insert service requests and runner applications but cannot read either table. Applicant-controlled inserts cannot set approval or review fields. Only active allowlisted admins can read or update requests and applications. Approved runners can select only the profile linked to their verified Auth user and only assignments belonging to that profile. The invitation Edge Function keeps the service-role key inside Supabase and verifies the caller against the administrator allowlist. Never place a Supabase service-role or secret key in this repository.

Before production use, enable MFA for every allowlisted administrator, review the Supabase Security Advisor, and keep the Google browser key restricted to `https://trashgrab.app/*`. The public publishable key is intentionally visible; RLS and explicit database grants are the security boundary.

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

## Stripe payment configuration

Set `STRIPE_SECRET_KEY` as a private Netlify environment variable to activate Book & Pay. The key is used only by the server-side Checkout function and must never be added to this repository or browser JavaScript. Recurring weekly and every-other-week service plans are billed monthly; one-time service uses a single payment. Plans with four or more bins continue through the saved custom-quote workflow instead of being charged automatically.
