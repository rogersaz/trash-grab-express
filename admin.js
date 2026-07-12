const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const rows = document.querySelector('#request-rows');
const emptyState = document.querySelector('#empty-state');
const resultCount = document.querySelector('#result-count');
const listHeading = document.querySelector('#list-heading');
const searchInput = document.querySelector('#search-input');
const requestDialog = document.querySelector('#request-dialog');
const updateForm = document.querySelector('#request-update-form');
const updateError = document.querySelector('#update-error');
const saveButton = document.querySelector('#save-request-button');
const deleteButton = document.querySelector('#delete-request-button');
const profileDialog = document.querySelector('#profile-dialog');
const profileForm = document.querySelector('#profile-form');
const profileError = document.querySelector('#profile-error');
const routeDate = document.querySelector('#route-date');
const routeStopsList = document.querySelector('#route-stops');
const routeEmpty = document.querySelector('#route-empty');
const openMapsButton = document.querySelector('#open-maps-button');

let requests = [];
let activeStatus = 'all';
let selectedRequestId = null;
let currentUser = null;
let adminProfile = null;
let routeOrder = [];

const statusLabels = {
  new: 'New', contacted: 'Contacted', scheduled: 'Scheduled',
  active: 'Active', completed: 'Completed', cancelled: 'Cancelled'
};
const planLabels = { weekly: 'Weekly', biweekly: 'Every other week', once: 'One time' };

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}
function clearError(element) {
  element.textContent = '';
  element.hidden = true;
}
function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(withTime ? value : value + 'T12:00:00');
  return new Intl.DateTimeFormat('en-US', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  ).format(date);
}
function makeCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}
function makeStatus(status) {
  const badge = document.createElement('span');
  badge.className = `status-pill status-${status}`;
  badge.textContent = statusLabels[status] || status;
  return badge;
}

async function userIsAdmin(userId) {
  const { data, error } = await client
    .from('trash_grab_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function authorizeSession(session) {
  if (!session || !(await userIsAdmin(session.user.id))) {
    if (session) await client.auth.signOut();
    loginView.hidden = false;
    dashboardView.hidden = true;
    return false;
  }
  loginView.hidden = true;
  dashboardView.hidden = false;
  currentUser = session.user;
  const email = session.user.email || 'Administrator';
  document.querySelector('#user-email').textContent = email;
  document.querySelector('#user-avatar').textContent = email.charAt(0).toUpperCase();
  await Promise.all([loadProfile(), loadRequests()]);
  return true;
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearError(loginError);
  loginButton.disabled = true;
  loginButton.textContent = 'Checking access…';
  const data = new FormData(loginForm);
  const { data: authData, error } = await client.auth.signInWithPassword({
    email: String(data.get('email')).trim().toLowerCase(),
    password: String(data.get('password'))
  });
  if (error) {
    showError(loginError, 'The email or password was not accepted.');
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign in securely <span>→</span>';
    return;
  }
  if (!(await authorizeSession(authData.session))) {
    showError(loginError, 'This account is valid but is not approved for the Trash Grab Express dashboard.');
  }
  loginButton.disabled = false;
  loginButton.innerHTML = 'Sign in securely <span>→</span>';
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await client.auth.signOut();
  requests = [];
  currentUser = null;
  adminProfile = null;
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginForm.reset();
});

async function loadRequests() {
  rows.replaceChildren();
  emptyState.hidden = true;
  const { data, error } = await client
    .from('trash_grab_service_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    emptyState.hidden = false;
    emptyState.querySelector('h3').textContent = 'Unable to load requests';
    emptyState.querySelector('p').textContent = 'Refresh the page or check your administrator access.';
    return;
  }
  requests = data || [];
  updateStats();
  renderRequests();
  renderRouteStops();
}

function updateStats() {
  document.querySelector('#stat-new').textContent = requests.filter(item => item.status === 'new').length;
  document.querySelector('#stat-scheduled').textContent = requests.filter(item => item.status === 'scheduled').length;
  document.querySelector('#stat-active').textContent = requests.filter(item => item.status === 'active').length;
  document.querySelector('#stat-total').textContent = requests.length;
}

function filteredRequests() {
  const query = searchInput.value.trim().toLowerCase();
  return requests.filter(item => {
    const matchesStatus = activeStatus === 'all' || item.status === activeStatus;
    const haystack = [item.first_name, item.last_name, item.email, item.phone, item.zip, item.address]
      .filter(Boolean).join(' ').toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
}

function renderRequests() {
  rows.replaceChildren();
  const filtered = filteredRequests();
  resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`;
  listHeading.textContent = activeStatus === 'all' ? 'All requests' : `${statusLabels[activeStatus]} requests`;
  emptyState.hidden = filtered.length !== 0;

  filtered.forEach(request => {
    const row = document.createElement('tr');

    const customerCell = document.createElement('td');
    const customer = document.createElement('div');
    customer.className = 'customer-cell';
    const name = document.createElement('strong');
    name.textContent = `${request.first_name} ${request.last_name}`;
    const email = document.createElement('span');
    email.textContent = request.email;
    customer.append(name, email);
    customerCell.append(customer);

    const planCell = makeCell(`${planLabels[request.plan_frequency] || request.plan_frequency} · ${request.bin_count} ${request.bin_count === 1 ? 'bin' : 'bins'}`);
    const startCell = makeCell(formatDate(request.preferred_start_date));

    const statusCell = document.createElement('td');
    statusCell.append(makeStatus(request.status));

    const createdCell = makeCell(formatDate(request.created_at, true));
    const actionCell = document.createElement('td');
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'view-button';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', () => openRequest(request.id));
    actionCell.append(viewButton);

    row.append(customerCell, planCell, startCell, statusCell, createdCell, actionCell);
    rows.append(row);
  });
}

document.querySelectorAll('.sidebar nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.sidebar nav button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    activeStatus = button.dataset.status;
    renderRequests();
  });
});
searchInput.addEventListener('input', renderRequests);
document.querySelector('#refresh-button').addEventListener('click', loadRequests);

function openRequest(id) {
  const request = requests.find(item => item.id === id);
  if (!request) return;
  selectedRequestId = id;

  document.querySelector('#detail-name').textContent = `${request.first_name} ${request.last_name}`;
  const detailStatus = document.querySelector('#detail-status');
  detailStatus.className = `status-pill status-${request.status}`;
  detailStatus.textContent = statusLabels[request.status] || request.status;

  const detailEmail = document.querySelector('#detail-email');
  detailEmail.textContent = request.email;
  detailEmail.href = `mailto:${request.email}`;

  const detailPhone = document.querySelector('#detail-phone');
  detailPhone.textContent = request.phone;
  detailPhone.href = `tel:${request.phone.replace(/[^+0-9]/g, '')}`;

  document.querySelector('#detail-address').textContent = `${request.address}, ${request.zip}`;
  document.querySelector('#detail-plan').textContent = `${planLabels[request.plan_frequency] || request.plan_frequency}${request.return_service ? ' with bin return' : ''}`;
  document.querySelector('#detail-bins').textContent = String(request.bin_count);
  document.querySelector('#detail-date').textContent = formatDate(request.preferred_start_date);
  document.querySelector('#detail-price').textContent = `$${Number(request.estimated_price).toFixed(2)}`;
  document.querySelector('#detail-notes').textContent = request.notes || 'No notes provided.';

  updateForm.elements.pickupDate.value = request.preferred_start_date;
  updateForm.elements.status.value = request.status;
  updateForm.elements.adminNotes.value = request.admin_notes || '';
  clearError(updateError);
  requestDialog.showModal();
}

updateForm.addEventListener('submit', async event => {
  event.preventDefault();
  const request = requests.find(item => item.id === selectedRequestId);
  if (!request) return;

  clearError(updateError);
  saveButton.disabled = true;
  saveButton.textContent = 'Saving…';

  const data = new FormData(updateForm);
  const nextStatus = String(data.get('status'));
  const now = new Date().toISOString();
  const updates = {
    preferred_start_date: String(data.get('pickupDate')),
    status: nextStatus,
    admin_notes: String(data.get('adminNotes') || '').trim() || null
  };
  if (nextStatus === 'contacted' && !request.contacted_at) updates.contacted_at = now;
  if (nextStatus === 'scheduled' && !request.scheduled_at) updates.scheduled_at = now;
  if (nextStatus === 'completed' && !request.completed_at) updates.completed_at = now;

  const { error } = await client
    .from('trash_grab_service_requests')
    .update(updates)
    .eq('id', selectedRequestId);

  if (error) {
    showError(updateError, 'Changes could not be saved. Please try again.');
    saveButton.disabled = false;
    saveButton.innerHTML = 'Save changes <span>→</span>';
    return;
  }

  requestDialog.close();
  await loadRequests();
  saveButton.disabled = false;
  saveButton.innerHTML = 'Save changes <span>→</span>';
});


async function deleteSelectedRequest() {
  const request = requests.find(item => item.id === selectedRequestId);
  if (!request) return;
  const confirmed = window.confirm(
    `Delete the pickup request for ${request.first_name} ${request.last_name}? This cannot be undone.`
  );
  if (!confirmed) return;

  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting…';
  const { error } = await client
    .from('trash_grab_service_requests')
    .delete()
    .eq('id', request.id);

  if (error) {
    showError(updateError, 'The pickup could not be deleted. Please try again.');
    deleteButton.disabled = false;
    deleteButton.textContent = 'Delete pickup';
    return;
  }

  requestDialog.close();
  selectedRequestId = null;
  deleteButton.disabled = false;
  deleteButton.textContent = 'Delete pickup';
  await loadRequests();
}
deleteButton.addEventListener('click', deleteSelectedRequest);

function profileAddress(profile = adminProfile) {
  if (!profile) return '';
  return [profile.home_address, profile.city, profile.state, profile.zip].filter(Boolean).join(', ');
}

async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await client
    .from('trash_grab_admin_profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) {
    console.error('Unable to load home base', { code: error.code, message: error.message });
    return;
  }
  adminProfile = data;
  document.querySelector('#home-base-summary').textContent = data
    ? profileAddress(data)
    : 'Home base not set';

  if (data) {
    profileForm.elements.fullName.value = data.full_name || '';
    profileForm.elements.phone.value = data.phone || '';
    profileForm.elements.homeAddress.value = data.home_address || '';
    profileForm.elements.city.value = data.city || '';
    profileForm.elements.state.value = data.state || '';
    profileForm.elements.zip.value = data.zip || '';
    profileForm.elements.returnHome.checked = data.return_home;
  }
  updateRouteButton();
}

function openProfile() {
  clearError(profileError);
  profileDialog.showModal();
}
['#profile-button', '#profile-nav-button', '#route-profile-button'].forEach(selector => {
  document.querySelector(selector).addEventListener('click', openProfile);
});

profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !profileForm.reportValidity()) return;
  clearError(profileError);
  const button = document.querySelector('#save-profile-button');
  button.disabled = true;
  button.textContent = 'Saving…';
  const data = new FormData(profileForm);
  const profile = {
    user_id: currentUser.id,
    full_name: String(data.get('fullName')).trim(),
    phone: String(data.get('phone') || '').trim() || null,
    home_address: String(data.get('homeAddress')).trim(),
    city: String(data.get('city')).trim(),
    state: String(data.get('state')).trim(),
    zip: String(data.get('zip')).trim(),
    return_home: data.get('returnHome') === 'on'
  };
  const { error } = await client
    .from('trash_grab_admin_profiles')
    .upsert(profile, { onConflict: 'user_id' });

  if (error) {
    showError(profileError, 'The home base could not be saved.');
    button.disabled = false;
    button.textContent = 'Save home base';
    return;
  }
  adminProfile = profile;
  document.querySelector('#home-base-summary').textContent = profileAddress(profile);
  profileDialog.close();
  button.disabled = false;
  button.textContent = 'Save home base';
  updateRouteButton();
});

function routeRequests() {
  const date = routeDate.value;
  const eligible = requests.filter(request =>
    request.preferred_start_date === date &&
    ['scheduled', 'active'].includes(request.status)
  );
  const ids = eligible.map(request => request.id);
  routeOrder = routeOrder.filter(id => ids.includes(id));
  ids.forEach(id => {
    if (!routeOrder.includes(id)) routeOrder.push(id);
  });
  return routeOrder
    .map(id => eligible.find(request => request.id === id))
    .filter(Boolean);
}

function moveRouteStop(id, direction) {
  const index = routeOrder.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= routeOrder.length) return;
  [routeOrder[index], routeOrder[target]] = [routeOrder[target], routeOrder[index]];
  renderRouteStops();
}

function renderRouteStops() {
  routeStopsList.replaceChildren();
  const stops = routeRequests();
  routeEmpty.hidden = stops.length !== 0;

  stops.forEach((request, index) => {
    const item = document.createElement('li');
    item.className = 'route-stop';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.routeId = request.id;
    checkbox.setAttribute('aria-label', `Include ${request.first_name} ${request.last_name}`);
    checkbox.addEventListener('change', updateRouteButton);

    const number = document.createElement('span');
    number.className = 'stop-number';
    number.textContent = String(index + 1);

    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${request.first_name} ${request.last_name}`;
    const address = document.createElement('small');
    address.textContent = `${request.address}, ${request.zip}`;
    details.append(name, address);

    const order = document.createElement('div');
    order.className = 'stop-order';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.setAttribute('aria-label', 'Move stop earlier');
    up.disabled = index === 0;
    up.addEventListener('click', () => moveRouteStop(request.id, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.setAttribute('aria-label', 'Move stop later');
    down.disabled = index === stops.length - 1;
    down.addEventListener('click', () => moveRouteStop(request.id, 1));
    order.append(up, down);

    item.append(checkbox, number, details, order);
    routeStopsList.append(item);
  });
  updateRouteButton();
}

function selectedRouteStops() {
  const selectedIds = [...routeStopsList.querySelectorAll('input[data-route-id]:checked')]
    .map(input => input.dataset.routeId);
  return routeRequests().filter(request => selectedIds.includes(request.id));
}

function updateRouteButton() {
  const count = selectedRouteStops().length;
  document.querySelector('#route-count').textContent = `${count} ${count === 1 ? 'stop' : 'stops'} selected`;
  openMapsButton.disabled = !adminProfile || count === 0;
}

openMapsButton.addEventListener('click', () => {
  const stops = selectedRouteStops();
  if (!adminProfile || !stops.length) return;
  if (stops.length > 8) {
    window.alert('Google Maps links support a limited number of stops. Select up to 8 pickups for one route.');
    return;
  }

  const home = profileAddress();
  const addresses = stops.map(request => `${request.address}, ${request.zip}`);
  const destination = adminProfile.return_home ? home : addresses[addresses.length - 1];
  const waypoints = adminProfile.return_home ? addresses : addresses.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: home,
    destination,
    travelmode: 'driving'
  });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener');
});

routeDate.addEventListener('change', () => {
  routeOrder = [];
  renderRouteStops();
});
document.querySelector('#route-nav-button').addEventListener('click', () => {
  document.querySelector('#route-planner').scrollIntoView({ behavior: 'smooth' });
});
routeDate.value = new Date().toISOString().split('T')[0];

(async () => {
  const { data } = await client.auth.getSession();
  if (data.session) await authorizeSession(data.session);
})();
