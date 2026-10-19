const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('API exposes required public actions', () => {
  const code = read('Code.gs');
  for (const action of [
    'health', 'config', 'referenceData', 'interviewDashboard', 'jobs', 'availability', 'operationStatus',
    'requestEmailVerification', 'verifyEmail', 'registerCandidate', 'bookInterview',
    'bookingLookup', 'rescheduleInterview'
  ]) assert.match(code, new RegExp(`['"]${action}['"]`));
});

test('public interview dashboard contract excludes private booking fields', () => {
  const dashboard = read('Dashboard.gs');
  for (const publicField of ['candidateId', 'round', 'date', 'startTime', 'endTime', 'batch']) {
    assert.match(dashboard, new RegExp(publicField));
  }
  for (const forbiddenOutput of [
    'candidateEmail:', 'candidateName:', 'hrName:', 'hrPhone:', 'hrEmail:',
    'manageTokenHash:', 'bookingId:', 'internalName:', 'company: booking.company'
  ]) assert.doesNotMatch(dashboard, new RegExp(forbiddenOutput));
  assert.match(dashboard, /PANEL_OR_WEEKEND_UNAVAILABLE/);
  assert.match(dashboard, /CONFLICT/);
  assert.match(dashboard, /NEXT_WEEKDAY/);
});

test('staging schema contains private safety ledgers', () => {
  const schema = read('Schema.gs');
  for (const tab of ['Candidates', 'Interview_Bookings', 'Booking_History', 'Slot_Blocks',
    'Special_Open_Dates', '_Sequences', '_Email_Queue', '_Email_Log', '_Otp_Challenges',
    '_Request_Log', '_Audit_Log', '_Upload_Sessions']) assert.match(schema, new RegExp(tab));
});

test('live-form field parity and private Drive uploads are enforced', () => {
  const validation = read('Validation.gs');
  const uploads = read('Uploads.gs');
  const manifest = read('appsscript.json');
  for (const field of ['whatsappNumber', 'passoutYear', 'collegeName', 'currentCtc', 'expectedCtc', 'noticePeriod', 'fullName', 'batch']) {
    assert.match(validation, new RegExp(field));
  }
  assert.match(uploads, /UPLOADS_FOLDER_ID/);
  assert.match(uploads, /assertRegistrationVerificationToken_/);
  assert.match(uploads, /UPLOAD_TYPE_NOT_ALLOWED/);
  assert.match(uploads, /setName\(uploadId/);
  assert.doesNotMatch(uploads, /setSharing|ANYONE|DOMAIN_WITH_LINK/);
  assert.match(manifest, /auth\/drive/);
});

test('runtime uses only the current staging ledger names', () => {
  const source = fs.readdirSync(root)
    .filter((name) => name.endsWith('.gs'))
    .map(read)
    .join('\n');
  for (const legacy of ['Availability_Overrides', '_Email_Verifications', '_Idempotency', '_Operations']) {
    assert.doesNotMatch(source, new RegExp(legacy));
  }
});

test('booking code has no business-field duplicate rejection', () => {
  const booking = read('Bookings.gs');
  assert.doesNotMatch(booking, /duplicate/i);
  assert.match(booking, /assertSlotAvailableUnlocked_/);
  assert.match(booking, /previousBookingId/);
  assert.match(booking, /PENDING_RESCHEDULE/);
});

test('weekends require special-open rows', () => {
  const availability = read('Availability.gs');
  assert.match(availability, /if \(weekend && !openRules\.length\) return/);
  assert.match(availability, /Special_Open_Dates/);
  assert.match(availability, /Slot_Blocks/);
});

test('public registration does not return candidate ID', () => {
  const candidate = read('Candidates.gs');
  const returnBlock = candidate.slice(candidate.lastIndexOf('return {'));
  assert.doesNotMatch(returnBlock, /candidateId\s*:/);
  assert.match(candidate, /queueEmailUnlocked_\('REGISTRATION'/);
});

test('every queued delivery has retry and uncertain-state handling', () => {
  const email = read('EmailQueue.gs');
  assert.match(email, /RETRY_SCHEDULED/);
  assert.match(email, /DELIVERY_OUTCOME_UNKNOWN/);
  assert.match(email, /EMAIL_MAX_ATTEMPTS/);
});

test('cross-origin mutation fallback validates origin and nonce', () => {
  const code = read('Code.gs');
  assert.match(code, /iframePostResponse_/);
  assert.match(code, /ALLOWED_WEB_ORIGINS/);
  assert.match(code, /window\.parent\.postMessage/);
  assert.match(code, /nonce/);
});

test('transport-only fields do not change idempotency fingerprint', () => {
  const data = read('Data.gs');
  for (const field of ['replyOrigin', 'nonce', 'transport']) {
    assert.match(data, new RegExp(`delete input\\.${field}`));
  }
});
