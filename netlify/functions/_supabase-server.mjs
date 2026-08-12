const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';

function serverKey() {
  return (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function headers(extra = {}) {
  const key = serverKey();
  return { apikey: key, 'content-type': 'application/json', ...extra };
}

export function hasSupabaseServerKey() {
  return Boolean(serverKey());
}

export async function getServiceRequest(id) {
  if (!hasSupabaseServerKey()) return null;
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,first_name,last_name,email,phone,address,zip,preferred_start_date,notes,plan_frequency,bin_count,return_service,estimated_price,payment_status,paid_at'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trash_grab_service_requests?${query}`, {
    headers: headers()
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}

export async function updatePaymentStatus(id, paymentStatus, paidAt = null) {
  if (!hasSupabaseServerKey()) return null;
  const query = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,first_name,last_name,email,plan_frequency,bin_count,return_service,estimated_price,payment_status,paid_at'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trash_grab_service_requests?${query}`, {
    method: 'PATCH',
    headers: headers({ prefer: 'return=representation' }),
    body: JSON.stringify({ payment_status: paymentStatus, paid_at: paidAt })
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows[0] || null;
}
