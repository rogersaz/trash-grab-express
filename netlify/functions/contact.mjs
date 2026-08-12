import { emailLayout, sendNotification } from './_email.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' }
  });
}

const clean = (value, max) => String(value || '').trim().slice(0, max);
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (Number(request.headers.get('content-length') || 0) > 8192) return json(413, { error: 'Message is too large.' });

  const body = await request.json().catch(() => null);
  if (!body || body.website) return json(422, { error: 'Invalid message.' });

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 30);
  const subject = clean(body.subject, 120);
  const message = clean(body.message, 3000);
  const startedAt = Number(body.startedAt);
  if (!name || !validEmail(email) || !subject || message.length < 10 || !Number.isFinite(startedAt) || Date.now() - startedAt < 2000) {
    return json(422, { error: 'Please check your contact details and message.' });
  }

  const messageId = crypto.randomUUID();
  const adminEmail = sendNotification({
    subject: `TrashGrab contact — ${subject}`,
    replyTo: email,
    idempotencyKey: `contact-${messageId}`,
    text: [
      'NEW TRASHGRAB.APP CONTACT MESSAGE',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Subject: ${subject}`,
      '',
      message
    ].join('\n')
  });
  const customerEmail = sendNotification({
    to: email,
    subject: 'We received your Trash Grab Express message',
    idempotencyKey: `contact-customer-${messageId}`,
    text: `Hi ${name},\n\nWe received your message about “${subject}.” We’ll reply as soon as we can.\n\nTrash Grab Express\nhttps://trashgrab.app`,
    html: emailLayout({
      heading: `Thanks for reaching out, ${name}.`,
      intro: `We received your message about “${subject}.” We’ll reply as soon as we can.`,
      ctaLabel: 'Return to TrashGrab.app',
      ctaUrl: 'https://trashgrab.app/'
    })
  });
  const [result] = await Promise.all([adminEmail, customerEmail]);

  return json(result.sent ? 200 : 503, result.sent ? { sent: true } : { error: 'Email is not configured yet.' });
}
