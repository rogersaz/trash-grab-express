import { emailLayout, sendNotification } from './_email.mjs';
import { getServiceRequest, hasSupabaseServerKey } from './_supabase-server.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
  });
}

const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 1024) return json(413, { error: 'Request is too large.' });
  if (!hasSupabaseServerKey()) return json(503, { error: 'Notifications are not configured.' });

  const body = await request.json().catch(() => null);
  if (!body || !validId(body.requestId)) return json(422, { error: 'Invalid request.' });

  const service = await getServiceRequest(body.requestId);
  if (!service) return json(404, { error: 'Request not found.' });

  const adminEmail = sendNotification({
    subject: `New Trash Grab request — ${service.first_name} ${service.last_name}`,
    replyTo: service.email,
    idempotencyKey: `service-request-${service.id}`,
    text: [
      'NEW TRASH GRAB EXPRESS SERVICE REQUEST',
      '',
      `Customer: ${service.first_name} ${service.last_name}`,
      `Email: ${service.email}`,
      `Phone: ${service.phone}`,
      `Address: ${service.address}, ${service.zip}`,
      `Preferred start: ${service.preferred_start_date}`,
      `Plan: ${service.plan_frequency}`,
      `Bins: ${service.bin_count}`,
      `Return service: ${service.return_service ? 'Yes' : 'No'}`,
      `Estimate: $${Number(service.estimated_price).toFixed(2)}`,
      `Notes: ${service.notes || 'None'}`,
      '',
      'Open admin: https://trashgrab.app/admin.html'
    ].join('\n')
  });
  const customerEmail = sendNotification({
    to: service.email,
    subject: 'We received your Trash Grab Express request',
    idempotencyKey: `service-request-customer-${service.id}`,
    text: [
      `Hi ${service.first_name},`,
      '',
      'We received your service request. Your service is not confirmed until availability and payment are reviewed.',
      `Plan: ${service.plan_frequency}`,
      `Bins: ${service.bin_count}`,
      `Preferred start: ${service.preferred_start_date}`,
      `Estimate: $${Number(service.estimated_price).toFixed(2)}`,
      '',
      'Questions? Reply to this email or visit https://trashgrab.app/#contact'
    ].join('\n'),
    html: emailLayout({
      heading: `Thanks, ${service.first_name}. We received your request.`,
      intro: 'We will review service availability and contact you if anything needs clarification. Service is confirmed after availability and payment are reviewed.',
      details: [
        ['Plan', service.plan_frequency],
        ['Bins', service.bin_count],
        ['Preferred start', service.preferred_start_date],
        ['Estimate', `$${Number(service.estimated_price).toFixed(2)}`]
      ],
      ctaLabel: 'Contact Trash Grab Express',
      ctaUrl: 'https://trashgrab.app/#contact'
    })
  });
  const [result] = await Promise.all([adminEmail, customerEmail]);

  return json(result.sent ? 200 : 503, result.sent ? { sent: true } : { error: 'Notification could not be sent.' });
}
