const SUPABASE_URL = 'https://vxgmpxcaaxqirsmzlkry.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z21weGNhYXhxaXJzbXpsa3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE4NjUzNTksImV4cCI6MjA0NzQ0MTM1OX0.ojFfNcincBhWUL7r7JDyulkzBiWaLmFJqtQ4kOyaCyE';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const loginView = document.querySelector('#runner-login-view');
const dashboardView = document.querySelector('#runner-dashboard-view');
const loginForm = document.querySelector('#runner-login-form');
const loginButton = document.querySelector('#runner-login-button');
const loginMessage = document.querySelector('#runner-login-message');
const loginError = document.querySelector('#runner-login-error');
const dateSelect = document.querySelector('#runner-date-select');
const stopList = document.querySelector('#runner-stop-list');
const emptyState = document.querySelector('#runner-empty-state');
const mapElement = document.querySelector('#runner-map');
const mapPlaceholder = document.querySelector('#runner-map-placeholder');
const mapStatus = document.querySelector('#runner-map-status');
const navigationLink = document.querySelector('#runner-navigation-link');

let runner = null;
let assignments = [];
let googleMapsPromise = null;
let mapInstance = null;
let mapMarkers = [];

function clearMessage(element) {
  element.textContent = '';
  element.hidden = true;
}

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function dateLabel(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', options).format(new Date(`${value}T12:00:00`));
}

function currentDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split('T')[0];
}

function approvedRedirectUrl() {
  return location.protocol === 'https:' || location.protocol === 'http:'
    ? `${location.origin}/runner.html`
    : 'https://trashgrab.app/runner.html';
}

async function signOutRunner() {
  await client.auth.signOut();
  runner = null;
  assignments = [];
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginForm.reset();
  clearRunnerMap();
}

async function authorizeRunner(session) {
  if (!session?.user) return false;
  const { data, error } = await client
    .from('trash_grab_runners')
    .select('id, first_name, last_name, email, active, approved_at')
    .eq('auth_user_id', session.user.id)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) {
    await client.auth.signOut();
    loginView.hidden = false;
    dashboardView.hidden = true;
    showMessage(loginError, 'This email is not linked to an active, approved Black & Blue runner account.');
    return false;
  }

  runner = data;
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector('#runner-first-name').textContent = data.first_name;
  document.querySelector('#runner-email').textContent = data.email;
  await loadAssignments();
  return true;
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage(loginMessage);
  clearMessage(loginError);
  loginButton.disabled = true;
  loginButton.textContent = 'Sending secure link…';
  const data = new FormData(loginForm);
  const email = String(data.get('email')).trim().toLowerCase();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: approvedRedirectUrl()
    }
  });
  if (error) {
    showMessage(loginError, 'A sign-in link could not be sent. Confirm that this is your approved runner email and try again.');
  } else {
    showMessage(loginMessage, 'Check your email for the secure Black & Blue runner sign-in link.');
  }
  loginButton.disabled = false;
  loginButton.innerHTML = 'Email my secure link <span>→</span>';
});

document.querySelector('#runner-logout-button').addEventListener('click', signOutRunner);

async function loadAssignments() {
  const { data, error } = await client
    .from('trash_grab_runner_assignments')
    .select('id, pickup_date, pickup_window, stop_label, service_address, bin_count, runner_notes, sequence_order, status')
    .neq('status', 'cancelled')
    .order('pickup_date', { ascending: true })
    .order('sequence_order', { ascending: true });

  if (error) {
    assignments = [];
    showMessage(loginError, 'Your route assignments could not be loaded. Please sign in again.');
    return;
  }
  assignments = data || [];
  populateDates();
  renderSelectedDate();
}

function populateDates() {
  const dates = [...new Set(assignments.map(item => item.pickup_date))].sort();
  dateSelect.replaceChildren();
  if (!dates.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No assigned dates';
    dateSelect.append(option);
    dateSelect.disabled = true;
    return;
  }

  dateSelect.disabled = false;
  dates.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = dateLabel(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    dateSelect.append(option);
  });
  const today = currentDate();
  dateSelect.value = dates.find(value => value >= today) || dates[dates.length - 1];
}

function selectedAssignments() {
  return assignments.filter(item => item.pickup_date === dateSelect.value);
}

function googleSearchUrl(address) {
  const params = new URLSearchParams({ api: '1', query: address });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function googleRouteUrl(stops) {
  if (!stops.length) return '';
  if (stops.length === 1) return googleSearchUrl(stops[0].service_address);
  const included = stops.slice(0, 10);
  const destination = included[included.length - 1].service_address;
  const waypoints = included.slice(0, -1).map(item => item.service_address);
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving', dir_action: 'navigate' });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function makeStop(item, index) {
  const listItem = document.createElement('li');
  const top = document.createElement('div');
  top.className = 'stop-top';
  const number = document.createElement('span');
  number.className = 'stop-number';
  number.textContent = String(index + 1);
  const text = document.createElement('div');
  const label = document.createElement('strong');
  label.textContent = item.stop_label;
  const address = document.createElement('span');
  address.textContent = item.service_address;
  text.append(label, address);
  top.append(number, text);

  const meta = document.createElement('div');
  meta.className = 'stop-meta';
  const windowBadge = document.createElement('span');
  windowBadge.textContent = item.pickup_window;
  const bins = document.createElement('span');
  bins.textContent = `${item.bin_count} ${item.bin_count === 1 ? 'bin' : 'bins'}`;
  meta.append(windowBadge, bins);
  listItem.append(top, meta);

  if (item.runner_notes) {
    const notes = document.createElement('p');
    notes.className = 'stop-notes';
    notes.textContent = item.runner_notes;
    listItem.append(notes);
  }
  const mapLink = document.createElement('a');
  mapLink.className = 'stop-map-link';
  mapLink.href = googleSearchUrl(item.service_address);
  mapLink.target = '_blank';
  mapLink.rel = 'noopener';
  mapLink.textContent = 'Open this stop in Google Maps ↗';
  listItem.append(mapLink);
  return listItem;
}

function updateStats(stops) {
  const upcoming = assignments.filter(item => item.pickup_date >= currentDate());
  const futureDates = upcoming.map(item => item.pickup_date).sort();
  document.querySelector('#runner-stat-next').textContent = futureDates.length
    ? dateLabel(futureDates[0], { month: 'short', day: 'numeric' })
    : 'None';
  document.querySelector('#runner-stat-stops').textContent = String(stops.length);
  document.querySelector('#runner-stat-upcoming').textContent = String(upcoming.length);
}

function renderSelectedDate() {
  const stops = selectedAssignments();
  stopList.replaceChildren(...stops.map(makeStop));
  emptyState.hidden = stops.length !== 0;
  document.querySelector('#runner-stop-count').textContent = `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`;
  document.querySelector('#runner-stop-title').textContent = dateSelect.value
    ? dateLabel(dateSelect.value, { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Your route';
  updateStats(stops);

  navigationLink.hidden = stops.length === 0;
  navigationLink.href = googleRouteUrl(stops);
  navigationLink.textContent = stops.length > 10
    ? 'Open first 10 stops in Google Maps ↗'
    : 'Open route in Google Maps ↗';
  renderMap(stops);
}

dateSelect.addEventListener('change', renderSelectedDate);

async function accessToken() {
  const { data } = await client.auth.getSession();
  if (!data.session?.access_token) throw new Error('Your runner session expired.');
  return data.session.access_token;
}

async function loadGoogleMaps() {
  if (window.google?.maps?.Map && window.google.maps.marker?.AdvancedMarkerElement) {
    return { api: window.google.maps, mapId: 'DEMO_MAP_ID' };
  }
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = (async () => {
    const token = await accessToken();
    const response = await fetch('/.netlify/functions/maps-config', {
      headers: { authorization: `Bearer ${token}` }
    });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.apiKey) throw new Error('Interactive map unavailable.');

    await new Promise((resolve, reject) => {
      const callbackName = `trashGrabRunnerMapReady_${Date.now()}`;
      window[callbackName] = () => {
        delete window[callbackName];
        resolve();
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.apiKey)}&loading=async&libraries=marker&callback=${callbackName}`;
      script.async = true;
      script.onerror = () => reject(new Error('Google Maps could not load.'));
      document.head.append(script);
    });
    return { api: window.google.maps, mapId: config.mapId || 'DEMO_MAP_ID' };
  })().catch(error => {
    googleMapsPromise = null;
    throw error;
  });
  return googleMapsPromise;
}

function clearRunnerMap() {
  mapMarkers.forEach(marker => { marker.map = null; });
  mapMarkers = [];
  mapInstance = null;
  mapElement.replaceChildren(mapPlaceholder);
  mapPlaceholder.hidden = false;
  mapStatus.textContent = '';
}

function geocode(maps, address) {
  const geocoder = new maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      const location = results?.[0]?.geometry?.location;
      if (status === 'OK' && location) resolve(location);
      else reject(new Error(`Map location unavailable for ${address}`));
    });
  });
}

function markerContent(index) {
  const marker = document.createElement('div');
  marker.className = 'runner-map-marker';
  const label = document.createElement('span');
  label.textContent = String(index + 1);
  marker.append(label);
  return marker;
}

async function renderMap(stops) {
  clearRunnerMap();
  if (!stops.length) return;
  mapStatus.textContent = 'Loading your assigned locations…';
  try {
    const googleMaps = await loadGoogleMaps();
    const maps = googleMaps.api;
    const locations = await Promise.all(stops.map(item => geocode(maps, item.service_address)));
    mapPlaceholder.hidden = true;
    mapElement.replaceChildren();
    mapInstance = new maps.Map(mapElement, {
      center: locations[0],
      zoom: 12,
      mapId: googleMaps.mapId,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true
    });
    const bounds = new maps.LatLngBounds();
    const info = new maps.InfoWindow();
    locations.forEach((position, index) => {
      bounds.extend(position);
      const marker = new maps.marker.AdvancedMarkerElement({
        map: mapInstance,
        position,
        title: `${index + 1}. ${stops[index].stop_label} — ${stops[index].service_address}`,
        content: markerContent(index),
        gmpClickable: true
      });
      marker.addListener('click', () => {
        const content = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = `${index + 1}. ${stops[index].stop_label}`;
        const address = document.createElement('div');
        address.textContent = stops[index].service_address;
        content.append(strong, address);
        info.setContent(content);
        info.open({ map: mapInstance, anchor: marker });
      });
      mapMarkers.push(marker);
    });
    if (locations.length === 1) mapInstance.setZoom(15);
    else mapInstance.fitBounds(bounds, 48);
    mapStatus.textContent = `${stops.length} assigned ${stops.length === 1 ? 'location' : 'locations'} shown. Verify every address before starting.`;
  } catch (error) {
    mapPlaceholder.hidden = false;
    mapStatus.textContent = 'The interactive map is unavailable. Use the Google Maps links beside each assigned stop.';
  }
}

client.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session && !runner) authorizeRunner(session);
  if (event === 'SIGNED_OUT') {
    dashboardView.hidden = true;
    loginView.hidden = false;
  }
});

(async () => {
  const { data } = await client.auth.getSession();
  if (data.session) await authorizeRunner(data.session);
})();
