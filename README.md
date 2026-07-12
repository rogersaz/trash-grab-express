# Trash Grab Express

A responsive service website with a Supabase-backed customer-request system and protected admin dashboard.

## Included

- responsive landing page and mobile navigation
- instant service-price estimator
- customer requests saved to Supabase
- protected admin login and request-management dashboard
- status filters, private admin notes, and request updates
- Row Level Security protecting customer data
- accessible FAQ accordion and motion preferences
- baseline browser security headers

## Admin

The dashboard is available at `/admin.html`. A Supabase Auth user must also be explicitly added to `public.trash_grab_admins`; having an account alone does not grant access.

## Security model

Anonymous visitors can insert service requests but cannot read any request rows. Only active allowlisted admins can read or update requests. Never place a Supabase service-role or secret key in this repository.
