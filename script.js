const state = { bins: 1, frequency: 'weekly', returns: true };

const prices = {
  weekly: { base: 22, extraBin: 6, returnFee: 6, label: 'Weekly curb service', period: '/ month' },
  biweekly: { base: 15, extraBin: 4, returnFee: 4, label: 'Every-other-week curb service', period: '/ month' },
  once: { base: 18, extraBin: 5, returnFee: 5, label: 'One-time curb service', period: '/ visit' }
};

function updateEstimate() {
  const plan = prices[state.frequency];
  const price = plan.base + ((state.bins - 1) * plan.extraBin) + (state.returns ? plan.returnFee : 0);
  document.querySelector('#estimate-price').textContent = price;
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
const copyButton = document.querySelector('#copy-summary');

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const data = new FormData(form);
  const plan = prices[state.frequency];
  const currentPrice = document.querySelector('#estimate-price').textContent;
  const currentPeriod = document.querySelector('#estimate-period').textContent;

  summary.textContent = [
    'TRASH GRAB EXPRESS — SERVICE REQUEST',
    '-------------------------------------',
    `Name: ${data.get('firstName')} ${data.get('lastName')}`,
    `Email: ${data.get('email')}`,
    `Phone: ${data.get('phone')}`,
    `Address: ${data.get('address')}, ${data.get('zip')}`,
    `Preferred start: ${data.get('date')}`,
    '',
    `Plan: ${plan.label}`,
    `Bins: ${state.bins === 4 ? '4+' : state.bins}`,
    `Bin return: ${state.returns ? 'Yes' : 'No'}`,
    `Estimated price: $${currentPrice} ${currentPeriod}`,
    `Notes: ${data.get('notes') || 'None'}`,
    '',
    'Status: Request created — service not yet confirmed'
  ].join('\n');

  copyButton.textContent = 'Copy request summary';
  dialog.showModal();
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
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

document.querySelector('#year').textContent = new Date().getFullYear();
updateEstimate();
