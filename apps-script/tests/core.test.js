const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Core.gs'), 'utf8');
const context = vm.createContext({ Date, JSON, Math, Number, Object, RegExp, String, Array });
vm.runInContext(source, context, { filename: 'Core.gs' });
const Core = context.Core;

test('rejects obvious dummy identity data', () => {
  assert.ok(Core.validateName('shiva123'));
  assert.ok(Core.validateName('test'));
  assert.ok(Core.validateEmail('test@test.com'));
  assert.ok(Core.validateEmail('person@mailinator.com'));
  assert.ok(Core.validatePhone('123456'));
  assert.ok(Core.validatePhone('9999999999'));
  assert.ok(Core.validatePhone('9876543210'), 'long sequential phone must be rejected');
  assert.ok(Core.validateHumanText('shiva123', 'Company', 2, 120, true));
  assert.ok(Core.validateHumanText('123456', 'Current CTC', 1, 40, true));
});

test('accepts realistic identity data', () => {
  assert.equal(Core.validateName('Shiva Kumar'), '');
  assert.equal(Core.validateName("D'Souza"), '');
  assert.equal(Core.validateEmail('candidate@example.org'), '');
  assert.equal(Core.validatePhone('9845012763'), '');
  assert.equal(Core.normalizePhone('+91 98450 12763'), '9845012763');
});

test('detects weekends without host timezone ambiguity', () => {
  assert.equal(Core.isWeekend('2026-10-24'), true);
  assert.equal(Core.weekdayCode('2026-10-24'), 'SAT');
  assert.equal(Core.isWeekend('2026-10-25'), true);
  assert.equal(Core.isWeekend('2026-10-26'), false);
});

test('treats adjacent intervals as non-overlapping', () => {
  assert.equal(Core.rangesOverlap('09:00', '09:30', '09:30', '10:00'), false);
  assert.equal(Core.rangesOverlap('09:00', '10:00', '09:30', '10:30'), true);
  assert.equal(Core.rangesOverlap('09:00', '10:00', '08:00', '09:01'), true);
});

test('canonicalization is stable across object key order', () => {
  assert.equal(Core.canonicalize({ b: 2, a: { y: 1, x: 0 } }), Core.canonicalize({ a: { x: 0, y: 1 }, b: 2 }));
});

test('escapes spreadsheet formulas and HTML', () => {
  assert.equal(Core.safeCell('=IMPORTDATA("https://bad")').startsWith("'"), true);
  assert.equal(Core.safeCell('Normal text'), 'Normal text');
  assert.equal(Core.escapeHtml('<script>'), '&lt;script&gt;');
});
