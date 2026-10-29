'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('web app manifest is valid JSON and has a stable root identity', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
});

test('all canonical raster PWA icon files referenced by the manifest exist', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png');
  assert.ok(pngIcons.length >= 2);
  for (const icon of pngIcons) {
    const localPath = icon.src.split('?')[0];
    assert.ok(fs.existsSync(path.join(root, localPath)), 'missing icon: ' + localPath);
  }
});

test('service worker precaches the offline page and uses a versioned cache', () => {
  const worker = read('sw.js');
  assert.match(worker, /const CACHE_NAME = 'gradecalc-v\d+'/);
  assert.match(worker, /['"]\/offline\.html['"]/);
  assert.match(worker, /AbortController/);
  assert.match(worker, /caches\.match\(['"]\/offline\.html['"]\)/);
});

test('main page links to the manifest and the current SVG icon version', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  const htmlIcon = html.match(/rel="icon"[^>]*href="([^"]+)"/);
  const workerIcon = worker.match(/['"]\/gradecalc-icon\.svg\?v=([^'"]+)['"]/);
  assert.ok(htmlIcon, 'favicon link should exist');
  assert.ok(workerIcon, 'service worker should precache the SVG icon');
  assert.equal(htmlIcon[1].split('?v=')[1], workerIcon[1], 'favicon and service-worker icon versions must match');
});

test('CGPA UI rejects values outside 0–10 and delegates calculation to shared logic', () => {
  const html = read('index.html');
  assert.match(html, /Each entered SGPA must be between 0 and 10/);
  assert.match(html, /var calculation = calculateCGPA\(indexed\)/);
  assert.match(html, /var cgpa = calculation\.cgpa\.toFixed\(2\)/);
});
