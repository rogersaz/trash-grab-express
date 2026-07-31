import test from 'node:test';
import assert from 'node:assert/strict';

import mapsConfigHandler from '../netlify/functions/maps-config.mjs';
import optimizeRouteHandler from '../netlify/functions/optimize-route.mjs';
import routeMapHandler from '../netlify/functions/route-map.mjs';

test('map functions reject unauthenticated requests', async () => {
  const configResponse = await mapsConfigHandler(new Request('https://trashgrab.app/.netlify/functions/maps-config'));
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route', {
    method: 'POST'
  }));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map', {
    method: 'POST'
  }));

  assert.equal(configResponse.status, 401);
  assert.equal(optimizeResponse.status, 401);
  assert.equal(mapResponse.status, 401);
});

test('route functions reject oversized request bodies before processing', async () => {
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route', {
    method: 'POST',
    headers: { 'content-length': '20001' }
  }));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map', {
    method: 'POST',
    headers: { 'content-length': '150001' }
  }));

  assert.equal(optimizeResponse.status, 413);
  assert.equal(mapResponse.status, 413);
});

test('map functions reject unsupported methods', async () => {
  const optimizeResponse = await optimizeRouteHandler(new Request('https://trashgrab.app/.netlify/functions/optimize-route'));
  const mapResponse = await routeMapHandler(new Request('https://trashgrab.app/.netlify/functions/route-map'));

  assert.equal(optimizeResponse.status, 405);
  assert.equal(mapResponse.status, 405);
});
