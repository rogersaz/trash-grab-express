import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectFile = path => new URL(`../${path}`, import.meta.url);

test('homepage targets Surprise trash can curb service with natural local copy', async () => {
  const html = await readFile(projectFile('index.html'), 'utf8');

  assert.match(html, /<title>Trash Can to Curb Service Surprise AZ \| Trash Grab Express<\/title>/);
  assert.match(html, /<h1>Trash can to curb service <br><em>in Surprise, AZ\.<\/em><\/h1>/);
  assert.match(html, /Need someone to take your trash cans out\?/);
  assert.match(html, /Trash can service for seniors/);
  assert.match(html, /Service while you’re out of town/);
  assert.match(html, /id="surprise-trash-can-service"/);
  assert.doesNotMatch(html, /trash can (?:curb )?service (?:in )?(?:Peoria|El Mirage|Sun City West)/i);
});

test('homepage exposes canonical, indexable, and valid local business metadata', async () => {
  const [html, robots, sitemap] = await Promise.all([
    readFile(projectFile('index.html'), 'utf8'),
    readFile(projectFile('robots.txt'), 'utf8'),
    readFile(projectFile('sitemap.xml'), 'utf8')
  ]);
  const jsonLdSource = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  )?.[1];

  assert.ok(jsonLdSource, 'Local business JSON-LD should exist');
  const jsonLd = JSON.parse(jsonLdSource);
  const graphTypes = jsonLd['@graph'].map(item => item['@type']);

  assert.match(html, /<link rel="canonical" href="https:\/\/trashgrab\.app\/"/);
  assert.match(html, /<meta name="robots" content="index,follow,max-image-preview:large"/);
  assert.deepEqual(graphTypes, ['WebSite', 'LocalBusiness']);
  assert.match(robots, /Sitemap: https:\/\/trashgrab\.app\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/trashgrab\.app\/<\/loc>/);
  assert.match(sitemap, /<lastmod>2026-07-31<\/lastmod>/);
});
