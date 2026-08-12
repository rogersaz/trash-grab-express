const DEFAULT_TO = 'trashbingrab@gmail.com';
const DEFAULT_FROM = 'Trash Grab Express <notifications@trashgrab.app>';

export async function sendNotification({ subject, text, replyTo, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const payload = {
    from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM,
    to: [process.env.RESEND_TO_EMAIL?.trim() || DEFAULT_TO],
    subject,
    text
  };
  if (replyTo) payload.reply_to = replyTo;

  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey.slice(0, 256);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Resend notification failed', { status: response.status, name: result?.name });
    return { sent: false, reason: 'provider_error' };
  }
  return { sent: true, id: result.id };
}

export function money(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase()
  }).format(Number(cents || 0) / 100);
}
