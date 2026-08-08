const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = { bins: 1, frequency: 'weekly', returns: true };
const prices = {
  weekly: { base: 22, extraBin: 6, returnFee: 6, label: 'Weekly curb service', period: '/ month' },
  biweekly: { base: 15, extraBin: 4, returnFee: 4, label: 'Every-other-week curb service', period: '/ month' },
  once: { base: 18, extraBin: 5, returnFee: 5, label: 'One-time curb service', period: '/ visit' }
};

function currentEstimate() {
  const plan = prices[state.frequency];
  return plan.base + ((state.bins - 1) * plan.extraBin) + (state.returns ? plan.returnFee : 0);
}

function updateEstimate() {
  const plan = prices[state.frequency];
  document.querySelector('#estimate-price').textContent = currentEstimate();
  document.querySelector('#estimate-period').textContent = plan.period;
  document.querySelector('#summary-frequency').textContent = plan.label;
  document.querySelector('#summary-bins').textContent = state.bins === 4 ? '4 or more trash bins' : `${state.bins} trash ${state.bins === 1 ? 'bin' : 'bins'}`;
  document.querySelector('#summary-return-row').hidden = !state.returns;
}

document.querySelectorAll('[data-control="bins"] button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-control="bins"] button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.bins = Number(button.dataset.value);
    updateEstimate();
  });
});

document.querySelectorAll('input[name="frequency"]').forEach(input => {
  input.addEventListener('change', event => {
    state.frequency = event.target.value;
    updateEstimate();
  });
});

document.querySelector('#return-service').addEventListener('change', event => {
  state.returns = event.target.checked;
  updateEstimate();
});

const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('#site-nav');
navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}));

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

const startDate = document.querySelector('input[name="date"]');
startDate.min = new Date().toISOString().split('T')[0];

document.querySelectorAll('.accordion details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    document.querySelectorAll('.accordion details').forEach(other => {
      if (other !== detail) other.open = false;
    });
  });
});

const form = document.querySelector('#booking-form');
const dialog = document.querySelector('#confirmation-dialog');
const summary = document.querySelector('#request-summary');
const confirmationMessage = document.querySelector('#confirmation-message');
const copyButton = document.querySelector('#copy-summary');
const submitButton = document.querySelector('#booking-submit');
const errorMessage = document.querySelector('#booking-error');
const runnerForm = document.querySelector('#runner-form');
const runnerSubmitButton = document.querySelector('#runner-submit');
const runnerErrorMessage = document.querySelector('#runner-error');
const runnerDialog = document.querySelector('#runner-confirmation-dialog');
const paymentStatus = document.querySelector('#payment-status');

const paymentResult = new URLSearchParams(window.location.search).get('payment');
if (paymentResult === 'success') {
  paymentStatus.textContent = '✓ Stripe checkout completed. Check your email for the payment receipt while we review service availability.';
  paymentStatus.hidden = false;
} else if (paymentResult === 'cancelled') {
  paymentStatus.textContent = 'Checkout was cancelled and no new payment was completed. Your service request is still saved.';
  paymentStatus.classList.add('cancelled');
  paymentStatus.hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  if (data.get('website')) return;

  const plan = prices[state.frequency];
  const price = currentEstimate();
  const originalButtonText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = 'Saving your booking…';
  errorMessage.hidden = true;

  const request = {
    first_name: String(data.get('firstName')).trim(),
    last_name: String(data.get('lastName')).trim(),
    email: String(data.get('email')).trim().toLowerCase(),
    phone: String(data.get('phone')).trim(),
    address: String(data.get('address')).trim(),
    zip: String(data.get('zip')).trim(),
    preferred_start_date: data.get('date'),
    notes: String(data.get('notes') || '').trim() || null,
    plan_frequency: state.frequency,
    bin_count: state.bins,
    return_service: state.returns,
    estimated_price: price
  };

  const { error } = await supabaseClient
    .from('trash_grab_service_requests')
    .insert(request);

  if (error) {
    console.error('Unable to save service request', { code: error.code, message: error.message });
    errorMessage.textContent = 'We could not save your request right now. Please check the details and try again.';
    errorMessage.hidden = false;
    submitButton.disabled = false;
    submitButton.innerHTML = originalButtonText;
    return;
  }

  submitButton.textContent = 'Opening secure Stripe checkout…';
  const checkoutToken = crypto.randomUUID();
  try {
    const checkoutResponse = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: request.email,
        frequency: state.frequency,
        bins: state.bins,
        returns: state.returns,
        checkoutToken
      })
    });
    const checkout = await checkoutResponse.json().catch(() => ({}));
    if (!checkoutResponse.ok || !checkout.url) {
      throw new Error(checkout.error || 'Secure checkout could not be opened.');
    }
    window.location.assign(checkout.url);
    return;
  } catch (checkoutError) {
    const safeCheckoutMessage = checkoutError instanceof Error
      ? checkoutError.message
      : 'Secure checkout could not be opened.';
    console.error(`Unable to open Stripe Checkout: ${safeCheckoutMessage}`);
    confirmationMessage.textContent = `Your request was securely saved, but online checkout could not open. No payment was taken. ${safeCheckoutMessage}`;
  }

  summary.textContent = [
    'TRASH GRAB EXPRESS — SERVICE REQUEST',
    '-------------------------------------',
    `Name: ${request.first_name} ${request.last_name}`,
    `Email: ${request.email}`,
    `Phone: ${request.phone}`,
    `Address: ${request.address}, ${request.zip}`,
    `Preferred start: ${request.preferred_start_date}`,
    '',
    `Plan: ${plan.label}`,
    `Bins: ${state.bins === 4 ? '4+' : state.bins}`,
    `Bin return: ${state.returns ? 'Yes' : 'No'}`,
    `Estimated price: $${price} ${plan.period}`,
    `Notes: ${request.notes || 'None'}`,
    '',
    'Status: Submitted — awaiting confirmation'
  ].join('\n');

  copyButton.textContent = 'Copy request summary';
  dialog.showModal();
  form.reset();
  submitButton.disabled = false;
  submitButton.innerHTML = originalButtonText;
});

document.querySelector('#confirmation-dialog .dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summary.textContent);
    copyButton.textContent = 'Copied to clipboard ✓';
  } catch {
    copyButton.textContent = 'Select and copy the summary above';
  }
});

runnerForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!runnerForm.reportValidity()) return;

  const data = new FormData(runnerForm);
  if (data.get('runnerWebsite')) return;

  const application = {
    first_name: String(data.get('runnerFirstName')).trim(),
    last_name: String(data.get('runnerLastName')).trim(),
    email: String(data.get('runnerEmail')).trim().toLowerCase(),
    phone: String(data.get('runnerPhone')).trim(),
    city: String(data.get('runnerCity')).trim(),
    zip: String(data.get('runnerZip')).trim(),
    availability: String(data.get('runnerAvailability')),
    reliable_transportation: data.get('reliableTransportation') === 'on',
    age_18_or_older: data.get('age18') === 'on',
    referral_interest: data.get('referralInterest') === 'on',
    experience: String(data.get('runnerExperience') || '').trim() || null
  };

  const originalButtonText = runnerSubmitButton.innerHTML;
  runnerSubmitButton.disabled = true;
  runnerSubmitButton.textContent = 'Submitting securely…';
  runnerErrorMessage.hidden = true;

  const { error } = await supabaseClient
    .from('trash_grab_runner_applications')
    .insert(application);

  if (error) {
    console.error('Unable to save runner application', { code: error.code, message: error.message });
    runnerErrorMessage.textContent = 'We could not submit your application right now. Please check the details and try again.';
    runnerErrorMessage.hidden = false;
    runnerSubmitButton.disabled = false;
    runnerSubmitButton.innerHTML = originalButtonText;
    return;
  }

  runnerForm.reset();
  runnerDialog.showModal();
  runnerSubmitButton.disabled = false;
  runnerSubmitButton.innerHTML = originalButtonText;
});

function closeRunnerDialog() {
  runnerDialog.close();
}
document.querySelector('#runner-confirmation-dialog .dialog-close').addEventListener('click', closeRunnerDialog);
document.querySelector('#close-runner-confirmation').addEventListener('click', closeRunnerDialog);
runnerDialog.addEventListener('click', event => {
  if (event.target === runnerDialog) closeRunnerDialog();
});

document.querySelector('#year').textContent = new Date().getFullYear();
updateEstimate();
