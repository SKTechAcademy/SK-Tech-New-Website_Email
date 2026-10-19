const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadGlobals(file) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return context;
}

test('Settings schema exactly matches the staging workbook contract', () => {
  const context = loadGlobals('Schema.gs');
  assert.deepEqual(Array.from(context.SK_SCHEMA.Settings), ['key', 'value', 'valueType', 'description', 'editable']);
  assert.deepEqual(
    Array.from(context.SK_SCHEMA.Candidates),
    [
      'createdAt', 'candidateId', 'fullName', 'email', 'emailNormalized', 'emailId',
      'emailIdNormalized', 'mobileNumber', 'whatsappNumber', 'gender', 'education',
      'passoutYear', 'collegeName', 'experienceLevel', 'currentAddress', 'currentCompany',
      'currentCtc', 'expectedCtc', 'noticePeriod', 'resumeFileUrl', 'aadharFileUrl',
      'offerLetterFileUrls', 'relievingLetterFileUrl', 'experienceLetterFileUrl', 'source',
      'status', 'verificationId', 'requestId', 'consentVersion', 'createdBy'
    ],
  );
  assert.equal(context.SK_SCHEMA.Interview_Bookings.includes('batch'), true);
  assert.equal(context.SK_SCHEMA._Upload_Sessions.includes('tokenHash'), true);
});

test('every required setting has five-column seed metadata', () => {
  const context = loadGlobals('Config.gs');
  const expected = [
    'ENVIRONMENT', 'TIME_ZONE', 'WEEKEND_DAYS', 'DEFAULT_SLOT_MINUTES',
    'BOOKING_WINDOW_DAYS', 'BOOKING_LEAD_MINUTES', 'OTP_TTL_MINUTES',
    'OTP_MAX_ATTEMPTS', 'EMAIL_MAX_ATTEMPTS', 'STAGING_EMAIL_ALLOWLIST',
    'STAGING_EMAIL_ALLOWED_DOMAINS', 'REGISTRATION_EMAIL_ENABLED',
    'BOOKING_EMAIL_ENABLED', 'RESCHEDULE_EMAIL_ENABLED', 'SUPPORT_EMAIL',
    'BOOKING_NOTIFICATION_TO', 'ADMIN_ALLOWLIST', 'ADMIN_DOMAIN',
    'GA4_MEASUREMENT_ID', 'WEBSITE_BASE_URL', 'ALLOWED_WEB_ORIGINS',
    'CONSENT_VERSION', 'TURNSTILE_ENABLED'
  ];
  assert.deepEqual(Object.keys(context.SK_DEFAULTS), expected);
  for (const key of expected) {
    assert.equal(Array.isArray(context.SK_SETTING_META[key]), true, `${key} metadata missing`);
    assert.equal(context.SK_SETTING_META[key].length, 3, `${key} metadata must define type, description and editable`);
  }
});

test('block scopes exactly match the workbook validation contract', () => {
  const setup = fs.readFileSync(path.join(root, 'Setup.gs'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'Admin.gs'), 'utf8');
  const availability = fs.readFileSync(path.join(root, 'Availability.gs'), 'utf8');
  const scopes = ['PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'];
  for (const scope of scopes) {
    assert.match(setup, new RegExp(`['"]${scope}['"]`));
    assert.match(admin, new RegExp(`['"]${scope}['"]`));
    assert.match(availability, new RegExp(`['"]${scope}['"]`));
  }
});

test('staging recipients are enforced before OTP queue and before MailApp', () => {
  const security = fs.readFileSync(path.join(root, 'Security.gs'), 'utf8');
  const email = fs.readFileSync(path.join(root, 'EmailQueue.gs'), 'utf8');
  assert.match(security, /assertStagingRecipientAllowed_\(email\)/);
  assert.match(security, /EMAIL_NOT_ALLOWED_IN_STAGING/);
  assert.ok(email.indexOf('isStagingRecipientAllowed_(row.recipient)') < email.indexOf('MailApp.sendEmail'));
  assert.match(email, /SUPPRESSED/);
});
