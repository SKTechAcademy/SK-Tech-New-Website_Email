const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createRuntime(tables) {
  const context = vm.createContext({
    Date,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    Array,
    Utilities: {
      formatDate(_date, _timezone, pattern) {
        if (pattern === 'H') return '8';
        if (pattern === 'm') return '0';
        throw new Error(`Unexpected pattern ${pattern}`);
      }
    },
    setting_(key) {
      return {
        TIME_ZONE: 'Asia/Kolkata',
        BOOKING_LEAD_MINUTES: '0',
        BOOKING_WINDOW_DAYS: '14'
      }[key] || '';
    },
    todayLocal_() { return '2026-10-19'; },
    records_(name) { return (tables[name] || []).map((row) => ({ ...row })); },
    addDaysToIsoDate_(value, days) {
      const date = new Date(`${value}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + Number(days));
      return date.toISOString().slice(0, 10);
    },
    appError_(code, message) { return Object.assign(new Error(message), { code, name: 'AppError' }); }
  });
  for (const file of ['Core.gs', 'Availability.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

function baseTables() {
  return {
    Panels: [{
      panelId: 'PANEL-A', publicLabel: 'Panel 1', active: 'TRUE',
      weekdays: 'MON,TUE,WED,THU,FRI', startTime: '09:00', endTime: '12:00',
      slotMinutes: '30', capacity: '1', effectiveFrom: '2026-01-01', effectiveTo: '2099-12-31'
    }],
    Special_Open_Dates: [],
    Slot_Blocks: [],
    Interview_Bookings: []
  };
}

test('weekend stays closed until a special-open row exists', () => {
  const tables = baseTables();
  let runtime = createRuntime(tables);
  let result = runtime.computeAvailability_('2026-10-24', 30, '');
  assert.equal(result.weekendClosed, true);
  assert.equal(result.slots.length, 0);

  tables.Special_Open_Dates.push({
    panelId: '', dateFrom: '2026-10-24', dateTo: '2026-10-24',
    startTime: '10:00', endTime: '12:00', active: 'TRUE'
  });
  runtime = createRuntime(tables);
  result = runtime.computeAvailability_('2026-10-24', 30, '');
  assert.equal(result.weekendClosed, false);
  assert.deepEqual(Array.from(result.slots, (slot) => slot.startTime), ['10:00', '10:30', '11:00', '11:30']);
});

test('all-panel and panel-specific blocks remove only overlapping slots', () => {
  const tables = baseTables();
  tables.Slot_Blocks.push({
    scope: 'PANEL_SLOT', panelId: 'PANEL-A', dateFrom: '2026-10-26', dateTo: '2026-10-26',
    startTime: '10:00', endTime: '10:30', active: 'TRUE'
  });
  const result = createRuntime(tables).computeAvailability_('2026-10-26', 30, '');
  assert.equal(result.slots.some((slot) => slot.startTime === '10:00'), false);
  assert.equal(result.slots.some((slot) => slot.startTime === '10:30'), true);
});

test('capacity blocks a slot but rescheduling may exclude its original booking', () => {
  const tables = baseTables();
  tables.Interview_Bookings.push({
    bookingId: 'TEST-BK-000001', candidateId: 'TEST-SK0001', panelId: 'PANEL-A',
    date: '2026-10-26', startTime: '10:00', endTime: '10:30', status: 'SCHEDULED'
  });
  const runtime = createRuntime(tables);
  const normal = runtime.computeAvailability_('2026-10-26', 30, '');
  assert.equal(normal.slots.some((slot) => slot.startTime === '10:00'), false);

  const reschedule = runtime.computeAvailability_('2026-10-26', 30, 'TEST-BK-000001');
  assert.equal(reschedule.slots.some((slot) => slot.startTime === '10:00'), true);
});

test('candidate identity never blocks another same-day available slot', () => {
  const tables = baseTables();
  tables.Interview_Bookings.push({
    bookingId: 'TEST-BK-000001', candidateId: 'TEST-SK0001', panelId: 'PANEL-A',
    date: '2026-10-26', startTime: '09:00', endTime: '09:30', status: 'SCHEDULED'
  });
  const result = createRuntime(tables).computeAvailability_('2026-10-26', 30, '');
  assert.equal(result.slots.some((slot) => slot.startTime === '09:00'), false);
  assert.equal(result.slots.some((slot) => slot.startTime === '09:30'), true);
  assert.equal(result.slots.some((slot) => slot.startTime === '10:00'), true);
});
