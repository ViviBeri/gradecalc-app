'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('all static projection and target calculator inputs have accessible names', () => {
  const ids = [
    'projection-future-sgpa',
    'projection-future-count',
    'target-current-cgpa',
    'target-goal-cgpa',
    'target-earned-credits',
    'target-remaining-credits'
  ];
  for (const id of ids) {
    const input = html.match(new RegExp('<input\\b[^>]*id="' + id + '"[^>]*>'));
    assert.ok(input, 'expected input #' + id);
    assert.match(input[0], /aria-label=|aria-labelledby=/, id + ' must have an accessible name');
  }
  assert.match(html, /id="conv-formula"[^>]*>/);
  assert.match(html, /<label[^>]*for="conv-formula"/);
  assert.match(html, /id="themeToggle"[^>]*aria-label="Toggle color theme"/);
});

test('keyboard focus is visible in normal and forced-colors modes', () => {
  assert.ok(html.includes(':where(button,input,select,textarea,a,[tabindex]):focus-visible'));
  assert.ok(html.includes('@media (forced-colors:active)'));
  assert.match(html, /outline:3px solid Highlight/);
});

test('adding and removing subject rows moves focus predictably', () => {
  assert.ok(html.includes('function addSubject()'));
  assert.ok(html.includes('firstField.focus()'));
  assert.ok(html.includes('function removeSubject(id)'));
  assert.ok(html.includes('nextField.focus()'));
});

test('adding and removing semester rows moves focus predictably', () => {
  assert.ok(html.includes('function addSem()'));
  assert.ok(html.includes('field.focus()'));
  assert.ok(html.includes('function removeSem(id)'));
  assert.ok(html.includes('nextField.focus()'));
});


test('navigation tabs expose selected state and their controlled panels', () => {
  for (const tab of ['sgpa', 'cgpa', 'convert', 'analytics', 'target']) {
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*role="tab"'));
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*aria-selected="(?:true|false)"'));
    assert.match(html, new RegExp('id="tab-' + tab + '"[^>]*aria-controls="panel-' + tab + '"'));
    assert.match(html, new RegExp('id="panel-' + tab + '"'));
  }
  assert.match(html, /setAttribute\('aria-selected','false'\)/);
  assert.match(html, /setAttribute\('aria-selected','true'\)/);
});

test('grade editor toggle reports expanded state', () => {
  assert.match(html, /id="gradeToggle"[^>]*aria-expanded="false"[^>]*aria-controls="grade-editor"/);
  assert.match(html, /setAttribute\('aria-expanded', String\(open\)\)/);
});

test('dynamically generated subject and semester remove controls have descriptive names', () => {
  assert.match(html, /aria-label="Remove subject '\+\(i\+1\)/);
  assert.match(html, /aria-label="Remove semester '\+\(i\+1\)/);
  assert.match(html, /function renderSubjects\(\)/);
  assert.match(html, /function renderSems\(\)/);
});

test('subject and semester inputs have labels and numeric constraints', () => {
  assert.ok(html.includes("aria-label=\"Subject name '+(i+1)+'\""));
  assert.ok(html.includes("aria-label=\"Marks for subject '+(i+1)+' out of 100\" min=\"0\" max=\"100\""));
  assert.ok(html.includes("aria-label=\"Credits for subject '+(i+1)+'\" min=\"1\" max=\"6\""));
  assert.ok(html.includes("aria-label=\"SGPA for '+label+'\" min=\"0\" max=\"10\""));
});

test('calculation outputs and arrear tracker announce dynamic status updates', () => {
  assert.match(html, /id="sgpa-result"[^>]*aria-live="polite"[^>]*role="status"/);
  assert.match(html, /id="cgpa-result"[^>]*aria-live="polite"[^>]*role="status"/);
  assert.match(html, /id="arrears-tracker"[^>]*aria-live="polite"/);
  assert.match(html, /aria-live="polite"/);
});

test('tab navigation exposes a tablist, tabpanels and keyboard navigation', () => {
  assert.match(html, /class="tab-bar" role="tablist" aria-label="Grade calculators"/);
  for (const tab of ['sgpa', 'cgpa', 'convert', 'analytics', 'target']) {
    assert.match(html, new RegExp('id="panel-' + tab + '"[^>]*role="tabpanel"'));
    assert.match(html, new RegExp('id="panel-' + tab + '"[^>]*aria-labelledby="tab-' + tab + '"'));
    assert.match(html, new RegExp('id="panel-' + tab + '"[^>]*tabindex="0"'));
  }
  assert.match(html, /function handleTabKeydown\(event\)/);
  assert.match(html, /event\.key === 'ArrowRight'/);
  assert.match(html, /event\.key === 'ArrowLeft'/);
  assert.match(html, /event\.key === 'Home'/);
  assert.match(html, /event\.key === 'End'/);
});


test('navigation tab bar uses the active theme surface for readable inactive tabs', () => {
  assert.ok(html.includes('.tab-bar{display:flex;background:var(--surface2)'));
  assert.ok(html.includes('.tab-btn{flex:1;padding:9px 0;background:transparent;border:none;border-radius:9px;color:var(--muted)'));
});

test('focus indicators use theme-specific high-contrast colors and filled controls use dark text', () => {
  assert.ok(html.includes('--focus-ring:#86EFAC'));
  assert.ok(html.includes('--focus-ring:#166534'));
  assert.ok(html.includes(':focus-visible{outline:3px solid var(--focus-ring)'));
  assert.ok(html.includes('.tab-btn.active{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#052e16'));
  assert.ok(html.includes('.btn-primary{flex:1;padding:13px 0;background:linear-gradient(135deg,var(--accent),var(--accent2));border:none;border-radius:12px;color:#052e16'));
});

test('arrear record removal controls identify the affected subject', () => {
  const arrears = fs.readFileSync(path.join(__dirname, '..', 'js', 'arrears.js'), 'utf8');
  assert.ok(arrears.includes('aria-label="Remove arrear record for \' + escapeHtml(record.subjectName)'));
});

test('every static button has a visible or programmatic accessible name', () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length > 0, 'expected static buttons');
  for (const [index, match] of buttons.entries()) {
    const attributes = match[1];
    const visibleText = match[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
    const hasProgrammaticName = /\baria-label=|\baria-labelledby=/.test(attributes);
    assert.ok(visibleText || hasProgrammaticName, 'button ' + (index + 1) + ' must have an accessible name');
  }
});

test('arrear tracker action buttons meet a 44px minimum touch height', () => {
  assert.match(html, /\.arrear-attempt-form button\{[^}]*min-height:44px/);
  assert.match(html, /\.arrear-remove\{min-height:44px/);
});


test('responsive layouts define compact breakpoints and narrow-screen overflow safeguards', () => {
  assert.ok(html.includes('@media(max-width:420px)'));
  assert.ok(html.includes('@media (max-width:360px)') || html.includes('@media(max-width:360px)'));
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr)'));
  assert.ok(html.includes('min-width:0'));
  assert.ok(html.includes('overflow-x:hidden'));
  assert.ok(html.includes('overflow-wrap:anywhere'));
});

test('motion-sensitive users receive reduced animation effects', () => {
  assert.ok(html.includes('@media (prefers-reduced-motion:reduce)') || html.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(html.includes('animation:none'));
});

test('arrear attempt controls have explicit labels and announce validation errors', () => {
  const arrears = fs.readFileSync(path.join(__dirname, '..', 'js', 'arrears.js'), 'utf8');
  assert.ok(arrears.includes('<label>Attempt date<input type="date" name="date" required />'));
  assert.ok(arrears.includes('<label>Marks (0–100)<input type="number" name="marks" min="0" max="100" step="0.01" required inputmode="decimal" />'));
  assert.ok(arrears.includes('<label class="arrear-check"><input type="checkbox" name="cleared" /> Mark this attempt as cleared</label>'));
  assert.ok(arrears.includes("message.setAttribute('role', 'alert')"));
  assert.ok(arrears.includes("message.setAttribute('aria-live', 'assertive')"));
  assert.ok(arrears.includes("updated.setAttribute('aria-live', 'polite')"));
});

test('subject and semester remove controls meet 44px touch target minimums at narrow widths', () => {
  assert.match(html, /\.remove-btn\{min-width:44px;min-height:44px;width:44px;height:44px/);
  assert.match(html, /\.col-labels\{display:grid;grid-template-columns:1fr 62px 58px 68px 44px/);
  assert.match(html, /\.subject-row\{display:grid;grid-template-columns:1fr 62px 58px 68px 44px/);
  assert.match(html, /\.sem-row\{display:grid;grid-template-columns:1fr 1fr 44px/);
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr) 50px 46px 50px 44px'));
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr) 46px 42px 46px 44px'));
  assert.ok(html.includes('grid-template-columns:minmax(0,1fr) 42px 38px 42px 44px'));
});

test('primary navigation, mode, grade and action buttons meet 44px touch target minimums', () => {
  assert.match(html, /\.grade-btn\{min-width:44px;min-height:44px/);
  assert.match(html, /\.tab-btn\{flex:1;min-height:44px/);
  assert.match(html, /\.mode-pill\{min-height:44px/);
  assert.match(html, /\.add-btn\{width:100%;min-height:44px/);
  assert.match(html, /\.btn-primary\{flex:1;min-height:44px/);
  assert.match(html, /\.btn-secondary\{flex:1;min-height:44px/);
});
