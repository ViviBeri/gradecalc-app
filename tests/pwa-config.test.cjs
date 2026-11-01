'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('web app manifest is valid and resolves correctly at root and GitHub Pages subpaths', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));

  for (const pageUrl of [
    'https://example.com/',
    'https://example.com/gradecalc-app/'
  ]) {
    const startUrl = new URL(manifest.start_url, pageUrl);
    const scopeUrl = new URL(manifest.scope, pageUrl);
    const idUrl = new URL(manifest.id, pageUrl);
    assert.equal(startUrl.href, pageUrl);
    assert.equal(scopeUrl.href, pageUrl);
    assert.equal(idUrl.href, pageUrl);
  }
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

test('service worker precaches the offline page and uses a versioned deployment-relative cache', () => {
  const worker = read('sw.js');
  assert.match(worker, /const BASE_PATH = new URL\('\.', self\.registration\.scope\)\.pathname/);
  assert.match(worker, /const CACHE_NAME = 'gradecalc-v\d+'/);
  assert.match(worker, /['"]offline\.html['"]/);
  assert.match(worker, /\.map\(path => BASE_PATH \+ path\)/);
  assert.match(worker, /caches\.match\(APP_ROOT \+ 'offline\.html'\)/);
  assert.match(worker, /AbortController/);
});

test('main page links to the manifest and the service worker precaches the matching SVG icon version', () => {
  const html = read('index.html');
  const worker = read('sw.js');
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  const htmlIcon = html.match(/rel="icon"[^>]*href="([^"]+)"/);
  const workerIcon = worker.match(/['"]gradecalc-icon\.svg\?v=([^'"]+)['"]/);
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

test('local storage failures and malformed saved data cannot prevent startup', () => {
  const html = read('index.html');
  assert.match(html, /function saveSubjectsToLocalStorage\(\)\s*\{\s*try\s*\{/);
  assert.match(html, /function saveSemestersToLocalStorage\(\)\s*\{\s*try\s*\{/);
  assert.match(html, /Array\.isArray\(parsedSubj\)/);
  assert.match(html, /Array\.isArray\(parsedSem\)/);
  assert.match(html, /function loadFromLocalStorage\(\)\s*\{/);
});

test('destructive SGPA and CGPA resets require explicit confirmation', () => {
  const html = read('index.html');
  assert.match(html, /function resetSGPA\(\)\s*\{\s*if \(!confirm\('Reset all saved SGPA subjects and marks\?/);
  assert.match(html, /function resetCGPA\(\)\s*\{\s*if \(!confirm\('Reset all saved semester SGPAs\?/);
});

test('restored subject and semester records receive safe default fields', () => {
  const html = read('index.html');
  assert.match(html, /subjects = parsedSubj\.map\(function \(item\)/);
  assert.match(html, /id: uid\(\), name: '', marks: '', credits: '', gradePoint: 0, gradeLabel: 'Ab'/);
  assert.match(html, /semesters = parsedSem\.map\(function \(item\)/);
  assert.match(html, /Object\.assign\(\{ id: uid\(\), sgpa: '' \}, item/);
});

test('subject-name HTML escaping protects quoted input attributes', () => {
  const html = read('index.html');
  assert.ok(html.includes('.replace(/[&<>"\']/g,'), "escapeHtml must match HTML-special characters");
  assert.match(html, /&quot;/);
  assert.match(html, /&#39;/);
});


test('all inline application scripts parse without JavaScript syntax errors', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, 'expected inline application scripts');
  scripts.forEach((match, index) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: 'index-inline-' + index + '.js' }));
  });
});
