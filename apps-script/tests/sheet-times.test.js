const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../Data.gs'), 'utf8'), context);

test('typed Sheet clock displays normalize without changing other fields', () => {
  for (const [input, expected] of [['9:00:00 am', '09:00'], ['6:00:00 pm', '18:00'], ['12:30:00 am', '00:30'], ['12:00 pm', '12:00'], ['09:30', '09:30']]) {
    assert.equal(context.normalizeSheetValue_('startTime', input), expected);
    assert.equal(context.normalizeSheetValue_('endTime', input), expected);
  }
  assert.equal(context.normalizeSheetValue_('fullName', '9:00:00 am'), '9:00:00 am');
  assert.equal(context.normalizeSheetValue_('startTime', ''), '');
});

test('typed dates use raw values and spreadsheet timezone, never ambiguous display strings', () => {
  context.getSpreadsheet_ = () => ({getSpreadsheetTimeZone: () => 'Asia/Kolkata'});
  context.Utilities = {formatDate: (value, zone, format) => {
    assert.equal(zone, 'Asia/Kolkata');
    assert.equal(format, 'yyyy-MM-dd');
    assert.equal(value.toISOString(), '2026-10-20T18:30:00.000Z');
    return '2026-10-21';
  }};
  const raw = new Date('2026-10-20T18:30:00.000Z');
  for (const header of ['date', 'dateFrom', 'dateTo', 'effectiveFrom', 'effectiveTo']) {
    assert.equal(context.normalizeSheetValue_(header, '10/21/2026', raw), '2026-10-21');
  }
  assert.equal(context.normalizeSheetValue_('fullName', 'unchanged', raw), 'unchanged');
});
