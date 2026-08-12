const DEFAULT_TO = 'trashbingrab@gmail.com';
const DEFAULT_FROM = 'Trash Grab Express <notifications@trashgrab.app>';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function emailLayout({ heading, intro, details = [], ctaLabel, ctaUrl }) {
  const rows = details.map(([label, value]) => `
    <tr><td style="padding:8px 0;color:#66736d;font-size:13px">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;color:#10231b;font-weight:700;font-size:13px">${escapeHtml(value)}</td></tr>`).join('');
  const cta = ctaLabel && ctaUrl
    ? `<p style="margin:26px 0 8px"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#ffcf25;color:#10231b;text-decoration:none;font-weight:800;padding:13px 18px;border-radius:10px">${escapeHtml(ctaLabel)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f5f1e8;font-family:Arial,sans-serif;color:#10231b"><div style="display:none;max-height:0;overflow:hidden">Trash Grab Express customer update</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#10231b;padding:22px 28px;color:#fff;font-size:19px;font-weight:800">Trash Grab <span style="color:#ffcf25">Express</span></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 14px;font-size:28px;line-height:1.15">${escapeHtml(heading)}</h1><p style="margin:0 0 22px;color:#52635b;line-height:1.6">${escapeHtml(intro)}</p>${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d8ddd8;border-bottom:1px solid #d8ddd8">${rows}</table>` : ''}${cta}<p style="margin:26px 0 0;color:#78867f;font-size:12px;line-height:1.5">Trash Grab Express · Surprise, Arizona<br><a href="https://trashgrab.app/privacy.html" style="color:#235340">Privacy</a> · <a href="https://trashgrab.app/terms.html" style="color:#235340">Terms</a> · <a href="https://trashgrab.app/cancellation.html" style="color:#235340">Cancellation</a></p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendNotification({ subject, text, html, replyTo, idempotencyKey, to }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: 'not_configured' };

  const payload = {
    from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to || process.env.RESEND_TO_EMAIL?.trim() || DEFAULT_TO],
    subject,
    text
  };
  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;

  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey.slice(0, 256);

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  } catch {
    console.error('Resend notification network request failed');
    return { sent: false, reason: 'network_error' };
  }
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
