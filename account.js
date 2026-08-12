const form = document.querySelector('#billing-portal-form');
const submit = document.querySelector('#billing-submit');
const status = document.querySelector('#billing-status');
const startedAt = Date.now();

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (data.get('website')) return;

  submit.disabled = true;
  submit.textContent = 'Sending secure link…';
  status.hidden = true;
  status.className = 'form-status';
  try {
    const response = await fetch('/.netlify/functions/request-billing-portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(data.get('email') || '').trim(),
        website: String(data.get('website') || ''),
        startedAt
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The secure link could not be requested.');
    status.textContent = `✓ ${result.message}`;
    status.classList.add('success');
    form.reset();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'The secure link could not be requested.';
    status.classList.add('error');
  } finally {
    status.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Send secure billing link';
  }
});
