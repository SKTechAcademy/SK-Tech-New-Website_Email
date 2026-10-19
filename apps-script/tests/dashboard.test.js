const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createRuntime(tables) {
  const settings = {
    TIME_ZONE: 'Asia/Kolkata',
    WEEKEND_DAYS: 'SAT,SUN',
    BOOKING_WINDOW_DAYS: '14',
    BOOKING_LEAD_MINUTES: '0',
    DEFAULT_SLOT_MINUTES: '30',
  };
  const context = vm.createContext({
    Date,
    JSON,
    Math,
    Number,
    Object,
    RegExp,
    String,
    Array,
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Utilities: { formatDate: (_date, _timezone, pattern) => pattern === 'H' ? '8' : '0' },
    setting_: (key) => settings[key] || '',
    todayLocal_: () => '2026-10-19',
    nowIso_: () => '2026-10-19T02:30:00.000Z',
    records_: (name) => (tables[name] || []).map((row) => ({ ...row })),
    isActiveFlag_: (value) => String(value).toUpperCase() === 'TRUE' || String(value) === '1',
    appError_: (code, message) => Object.assign(new Error(message), { code, name: 'AppError' }),
  });
  for (const file of ['Core.gs', 'Dashboard.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

function baseTables() {
  return {
    Interview_Bookings: [
      {
        bookingId: 'PRIVATE-BOOKING-1', candidateId: 'SK32', candidateName: 'Private Name',
        candidateEmail: 'private@example.com', manageTokenHash: 'private-token', hrName: 'Private HR',
        hrPhone: '9999999999', hrEmail: 'hr@example.com', company: 'Private Company',
        batch: '2', panelId: 'PANEL-A', date: '2026-10-19', startTime: '10:00', endTime: '10:30',
        round: 'Round 1', status: 'SCHEDULED'
      },
      {
        bookingId: 'PRIVATE-BOOKING-2', candidateId: 'SK32', batch: '2', panelId: 'PANEL-A',
        date: '2026-10-19', startTime: '11:00', endTime: '11:30', round: 'Round 2', status: 'CONFIRMED'
      },
      {
        bookingId: 'PRIVATE-BOOKING-3', candidateId: 'SK44', batch: '3', panelId: 'PANEL-A',
        date: '2026-10-20', startTime: '10:00', endTime: '10:30', round: 'Round 1', status: 'SCHEDULED'
      },
      {
        bookingId: 'PRIVATE-BOOKING-4', candidateId: 'SK55', batch: '4', panelId: 'PANEL-A',
        date: '2026-10-21', startTime: '10:00', endTime: '10:30', round: 'Round 2', status: 'SCHEDULED'
      },
      {
        bookingId: 'PRIVATE-OLD', candidateId: 'SK66', batch: '1', panelId: 'PANEL-A',
        date: '2026-10-22', startTime: '10:00', endTime: '10:30', round: 'Round 1', status: 'RESCHEDULED'
      }
    ],
    Panels: [{
      panelId: 'PANEL-A', publicLabel: 'Public panel 1', internalName: 'Secret employee name', active: 'TRUE',
      weekdays: 'MON,TUE,WED,THU,FRI', startTime: '09:00', endTime: '12:00', slotMinutes: '30', capacity: '1',
      effectiveFrom: '2026-01-01', effectiveTo: '2099-12-31'
    }],
    Slot_Blocks: [],
    Special_Open_Dates: [],
    Jobs: [
      {
        jobId: 'JOB-NEW', company: 'Example Co', title: 'QA Engineer', experience: '1 year', location: 'Bengaluru',
        skills: 'Testing, API', employmentType: 'Full-time', salary: 'Not disclosed', description: 'private contact',
        applyUrl: 'https://example.org/new', status: 'ACTIVE', postedDate: '2026-10-10'
      },
      {
        jobId: 'JOB-OLD', company: 'Example Co', title: 'Engineer', experience: '2 years', location: 'Hyderabad',
        skills: 'Java', employmentType: 'Full-time', salary: 'Not disclosed', applyUrl: 'https://example.org/old',
        status: 'ACTIVE', postedDate: '2026-08-01'
      },
      {
        jobId: 'JOB-DRAFT', company: 'Hidden Co', title: 'Hidden', status: 'DRAFT', postedDate: '2026-10-10'
      }
    ]
  };
}

test('dashboard supplies exact safe interview columns and partitions dates/jobs', () => {
  const runtime = createRuntime(baseTables());
  const result = runtime.getInterviewDashboard_({ slotDays: 3, interviewLimit: 20, jobLimit: 20 });
  const plain = JSON.parse(JSON.stringify(result));

  assert.equal(plain.counts.upcomingInterviews, 4);
  assert.equal(plain.counts.todayInterviews, 2);
  assert.equal(plain.counts.tomorrowInterviews, 1);
  assert.equal(plain.counts.jobOpenings, 2);
  assert.equal(plain.counts.newOpenings, 1);
  assert.equal(plain.counts.oldOpenings, 1);
  assert.equal(plain.interviews.allUpcoming[3].dateCategory, 'NEXT_WEEKDAY');
  assert.deepEqual(Object.keys(plain.interviews.allUpcoming[0]).sort(), [
    'batch', 'date', 'dateCategory', 'displayCategory', 'from', 'hasConflict', 'id',
    'panelOrWeekendUnavailable', 'round', 'stateCategory', 'statusLabel', 'to'
  ]);
  const serialized = JSON.stringify(plain);
  for (const secret of [
    'Private Name', 'private@example.com', 'private-token', 'Private HR', '9999999999',
    'hr@example.com', 'Private Company', 'Secret employee name', 'private contact'
  ]) assert.equal(serialized.includes(secret), false, `dashboard leaked ${secret}`);
});

test('same-day non-overlapping interviews are valid; overlaps are conflicts', () => {
  const tables = baseTables();
  let runtime = createRuntime(tables);
  let result = JSON.parse(JSON.stringify(runtime.getInterviewDashboard_({ slotDays: 1 })));
  assert.equal(result.interviews.today.every((row) => row.hasConflict === false), true);

  tables.Interview_Bookings.push({
    bookingId: 'PRIVATE-OVERLAP', candidateId: 'SK32', batch: '2', panelId: 'PANEL-A',
    date: '2026-10-19', startTime: '10:15', endTime: '10:45', round: 'Round 3', status: 'SCHEDULED'
  });
  runtime = createRuntime(tables);
  result = JSON.parse(JSON.stringify(runtime.getInterviewDashboard_({ slotDays: 1 })));
  const candidateRows = result.interviews.today.filter((row) => row.id === 'SK32');
  assert.equal(candidateRows.filter((row) => row.hasConflict).length, 2);
  assert.equal(candidateRows.find((row) => row.from === '11:00').hasConflict, false);
});

test('weekend/block state is public-safe and availability never exposes panel IDs', () => {
  const tables = baseTables();
  tables.Interview_Bookings.push({
    bookingId: 'PRIVATE-WEEKEND', candidateId: 'SK77', batch: '1', panelId: 'PANEL-A',
    date: '2026-10-24', startTime: '10:00', endTime: '10:30', round: 'Round 1', status: 'SCHEDULED'
  });
  tables.Slot_Blocks.push({
    blockId: 'PRIVATE-BLOCK', scope: 'PANEL_SLOT', panelId: 'PANEL-A', dateFrom: '2026-10-20',
    dateTo: '2026-10-20', startTime: '10:00', endTime: '10:30', reason: 'Private reason', active: 'TRUE'
  });
  const runtime = createRuntime(tables);
  const result = JSON.parse(JSON.stringify(runtime.getInterviewDashboard_({ slotDays: 6 })));
  const weekend = result.interviews.allUpcoming.find((row) => row.id === 'SK77');
  assert.equal(weekend.stateCategory, 'PANEL_OR_WEEKEND_UNAVAILABLE');
  const blocked = result.interviews.allUpcoming.find((row) => row.id === 'SK44');
  assert.equal(blocked.stateCategory, 'PANEL_OR_WEEKEND_UNAVAILABLE');
  const availabilityJson = JSON.stringify(result.availability);
  assert.equal(availabilityJson.includes('PANEL-A'), false);
  assert.equal(availabilityJson.includes('PRIVATE-BLOCK'), false);
  assert.equal(availabilityJson.includes('Private reason'), false);
  assert.ok(result.availability.tableRows.length > 0);
  assert.deepEqual(Object.keys(result.availability.tableRows[0]).sort(), [
    'batch', 'date', 'dateCategory', 'displayCategory', 'from', 'id',
    'remainingCapacity', 'round', 'stateCategory', 'statusLabel', 'to'
  ]);
  assert.equal(result.availability.tableRows[0].id, 'Available');
  assert.equal(result.interviews.unavailable.some((row) => row.sourceCategory === 'SLOT_BLOCK'), true);
});

test('legacy supporter-unavailable booking is classified without exposing private fields', () => {
  const tables = baseTables();
  tables.Interview_Bookings.push({
    bookingId: 'PRIVATE-SUPPORT', candidateId: 'SK99', batch: '4', panelId: 'PANEL-A',
    date: '2026-10-20', startTime: '09:00', endTime: '09:30',
    round: 'Interview Supporter not available', status: 'SCHEDULED'
  });
  const runtime = createRuntime(tables);
  const result = JSON.parse(JSON.stringify(runtime.getInterviewDashboard_({ slotDays: 2 })));
  const row = result.interviews.allUpcoming.find((item) => item.id === 'SK99');
  assert.equal(row.stateCategory, 'PANEL_OR_WEEKEND_UNAVAILABLE');
  assert.equal(row.statusLabel, 'PANEL UNAVAILABLE');
});
