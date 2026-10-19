var SK_DEFAULTS = {
  ENVIRONMENT: 'STAGING',
  TIME_ZONE: 'Asia/Kolkata',
  WEEKEND_DAYS: 'SAT,SUN',
  DEFAULT_SLOT_MINUTES: '30',
  BOOKING_WINDOW_DAYS: '14',
  BOOKING_LEAD_MINUTES: '120',
  OTP_TTL_MINUTES: '10',
  OTP_MAX_ATTEMPTS: '5',
  EMAIL_MAX_ATTEMPTS: '5',
  STAGING_EMAIL_ALLOWLIST: '',
  STAGING_EMAIL_ALLOWED_DOMAINS: 'mysktech.com',
  REGISTRATION_EMAIL_ENABLED: 'TRUE',
  BOOKING_EMAIL_ENABLED: 'TRUE',
  RESCHEDULE_EMAIL_ENABLED: 'TRUE',
  SUPPORT_EMAIL: 'support@mysktech.com',
  BOOKING_NOTIFICATION_TO: '',
  ADMIN_ALLOWLIST: '',
  ADMIN_DOMAIN: '',
  GA4_MEASUREMENT_ID: '',
  WEBSITE_BASE_URL: '',
  ALLOWED_WEB_ORIGINS: '',
  CONSENT_VERSION: 'candidate-contact-v1',
  TURNSTILE_ENABLED: 'FALSE'
};

var SK_SETTING_META = {
  ENVIRONMENT: ['string', 'Prevents production IDs and restricts email delivery.', false],
  TIME_ZONE: ['string', 'IANA time zone used for dates, interview times and emails.', true],
  WEEKEND_DAYS: ['csv', 'Closed by default unless a special-open rule applies.', true],
  DEFAULT_SLOT_MINUTES: ['integer', 'Default appointment interval for new panels.', true],
  BOOKING_WINDOW_DAYS: ['integer', 'Maximum days ahead that a candidate may book.', true],
  BOOKING_LEAD_MINUTES: ['integer', 'Minimum notice before a same-day interview.', true],
  OTP_TTL_MINUTES: ['integer', 'Email verification code lifetime.', true],
  OTP_MAX_ATTEMPTS: ['integer', 'Maximum incorrect verification attempts.', true],
  EMAIL_MAX_ATTEMPTS: ['integer', 'Maximum known-failure email delivery attempts.', true],
  STAGING_EMAIL_ALLOWLIST: ['csv', 'Exact email addresses allowed to receive staging mail.', true],
  STAGING_EMAIL_ALLOWED_DOMAINS: ['csv', 'Email domains allowed to receive staging mail.', true],
  REGISTRATION_EMAIL_ENABLED: ['boolean', 'Queue registration confirmations.', true],
  BOOKING_EMAIL_ENABLED: ['boolean', 'Queue booking confirmations.', true],
  RESCHEDULE_EMAIL_ENABLED: ['boolean', 'Queue reschedule confirmations.', true],
  SUPPORT_EMAIL: ['string', 'Reply-to address for automated mail.', true],
  BOOKING_NOTIFICATION_TO: ['csv', 'Optional internal notification recipients.', true],
  ADMIN_ALLOWLIST: ['csv', 'Optional exact admin email addresses.', true],
  ADMIN_DOMAIN: ['string', 'Optional Google Workspace domain for sidebar administrators.', true],
  GA4_MEASUREMENT_ID: ['string', 'Public GA4 measurement ID; never send PII in events.', true],
  WEBSITE_BASE_URL: ['string', 'Staging website base URL used in booking-management links.', true],
  ALLOWED_WEB_ORIGINS: ['csv', 'Exact origins allowed to receive iframe API responses.', true],
  CONSENT_VERSION: ['string', 'Consent text version recorded with a registration.', true],
  TURNSTILE_ENABLED: ['boolean', 'Reserved for a future verified frontend integration; keep disabled.', false]
};

function getSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var id = properties.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw appError_('NOT_CONFIGURED', 'The staging workbook is not configured.');
  properties.setProperty('SPREADSHEET_ID', active.getId());
  return active;
}

function getSettings_() {
  var cached = CacheService.getScriptCache().get('settings-v2');
  if (cached) {
    try { return JSON.parse(cached); } catch (ignore) {}
  }
  var settings = {};
  Object.keys(SK_DEFAULTS).forEach(function (key) { settings[key] = SK_DEFAULTS[key]; });
  var sheet;
  try { sheet = getSpreadsheet_().getSheetByName('Settings'); } catch (ignore2) { sheet = null; }
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues().forEach(function (row) {
      if (row[0]) settings[row[0]] = row[1];
    });
  }
  CacheService.getScriptCache().put('settings-v2', JSON.stringify(settings), 120);
  return settings;
}

function setting_(key) {
  var settings = getSettings_();
  return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : '';
}

function settingBoolean_(key) {
  return String(setting_(key)).toUpperCase() === 'TRUE';
}

function clearSettingsCache_() {
  CacheService.getScriptCache().remove('settings-v1');
  CacheService.getScriptCache().remove('settings-v2');
}

function nowIso_() {
  return new Date().toISOString();
}

function todayLocal_() {
  return Utilities.formatDate(new Date(), setting_('TIME_ZONE') || 'Asia/Kolkata', 'yyyy-MM-dd');
}

function appError_(code, message, fieldErrors) {
  var error = new Error(message || 'The request could not be completed.');
  error.name = 'AppError';
  error.code = code || 'REQUEST_FAILED';
  error.fieldErrors = fieldErrors || null;
  return error;
}
