var SK_API_VERSION = '2026-10-19.3';

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = String(params.action || 'health');
  var requestId = String(params.requestId || '');
  try {
    if (action === 'uploadWidget') return getUploadWidget_(params);
    var data;
    if (action === 'health') data = getHealth_();
    else if (action === 'config') data = getPublicConfig_();
    else if (action === 'referenceData') data = getReferenceData_();
    else if (action === 'interviewDashboard' || action === 'dashboard') data = getInterviewDashboard_(params);
    else if (action === 'jobs') data = getJobs_(params);
    else if (action === 'availability') data = getAvailability_(params);
    else if (action === 'operationStatus') data = getOperationStatus_(params.token);
    else throw appError_('ACTION_NOT_FOUND', 'The requested API action is not available.');
    return contentResponse_(successEnvelope_(data.code || 'OK', data, requestId), params.callback);
  } catch (error) {
    return contentResponse_(errorEnvelope_(error, requestId), params.callback);
  }
}

function doPost(e) {
  var payload = {};
  var requestId = '';
  try {
    payload = parsePostPayload_(e);
    requestId = String(payload.requestId || '');
    var action = String(payload.action || '');
    var data;
    if (action === 'requestEmailVerification') data = requestEmailVerification_(payload);
    else if (action === 'verifyEmail') data = verifyEmail_(payload);
    else if (action === 'registerCandidate') data = registerCandidate_(payload);
    else if (action === 'bookInterview') data = bookInterview_(payload);
    else if (action === 'bookingLookup') data = bookingLookup_(payload);
    else if (action === 'rescheduleInterview') data = rescheduleInterview_(payload);
    else throw appError_('ACTION_NOT_FOUND', 'The requested API action is not available.');
    return postResponse_(successEnvelope_(data.code || 'OK', data, requestId), e, payload);
  } catch (error) {
    console.error(JSON.stringify({ code: error && error.code || 'INTERNAL_ERROR', requestId: requestId }));
    return postResponse_(errorEnvelope_(error, requestId), e, payload);
  }
}

function parsePostPayload_(e) {
  var content = e && e.postData && e.postData.contents ? e.postData.contents : '';
  if (content.length > 50000) throw appError_('PAYLOAD_TOO_LARGE', 'The request is too large.');
  if (content) {
    try {
      var parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      return parsed;
    } catch (error) {
      if (e.parameter && e.parameter.payload) {
        try { return JSON.parse(e.parameter.payload); } catch (ignore) {}
      }
      throw appError_('INVALID_JSON', 'The request format is invalid.');
    }
  }
  if (e && e.parameter && e.parameter.payload) {
    try { return JSON.parse(e.parameter.payload); } catch (ignore2) {}
  }
  throw appError_('EMPTY_REQUEST', 'The request body is required.');
}

function successEnvelope_(code, data, requestId) {
  var safeData = {};
  Object.keys(data || {}).forEach(function (key) {
    if (key !== 'code' && key.charAt(0) !== '_') safeData[key] = data[key];
  });
  return { ok: true, code: code, data: safeData, requestId: requestId || '', timestamp: nowIso_() };
}

function errorEnvelope_(error, requestId) {
  var known = error && error.name === 'AppError';
  return {
    ok: false,
    code: known ? error.code : 'INTERNAL_ERROR',
    message: known ? error.message : 'The request could not be completed. Please try again.',
    fieldErrors: known && error.fieldErrors ? error.fieldErrors : undefined,
    requestId: requestId || '',
    timestamp: new Date().toISOString()
  };
}

function contentResponse_(payload, callback) {
  var json = JSON.stringify(payload);
  var cb = String(callback || '');
  if (cb) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$.]{0,80}$/.test(cb)) {
      json = JSON.stringify(errorEnvelope_(appError_('INVALID_CALLBACK', 'The callback name is invalid.'), payload.requestId));
      return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function postResponse_(payload, event, requestPayload) {
  if (event && event.parameter && event.parameter.transport === 'iframe') {
    return iframePostResponse_(payload, requestPayload || {});
  }
  return contentResponse_(payload, '');
}

function iframePostResponse_(payload, requestPayload) {
  var requestedOrigin = normalizeOrigin_(requestPayload.replyOrigin);
  var allowed = String(setting_('ALLOWED_WEB_ORIGINS') || '').split(',').map(normalizeOrigin_).filter(Boolean);
  var nonce = String(requestPayload.nonce || '');
  if (!requestedOrigin || allowed.indexOf(requestedOrigin) === -1 || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>API response origin is not authorized.</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var message = JSON.stringify({ source: 'sk-tech-api', nonce: nonce, payload: payload })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  var originJson = JSON.stringify(requestedOrigin);
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><script>' +
    'window.parent.postMessage(' + message + ',' + originJson + ');' +
    '</script><p>Request complete.</p>'
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function normalizeOrigin_(value) {
  var origin = String(value || '').trim().replace(/\/$/, '').toLowerCase();
  if (!/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(origin) &&
      !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin)) return '';
  return origin;
}

function getHealth_() {
  var configured = Boolean(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
  return {
    code: 'HEALTHY',
    service: 'sk-tech-staging-api',
    version: SK_API_VERSION,
    environment: configured ? setting_('ENVIRONMENT') : 'UNCONFIGURED',
    configured: configured
  };
}

function getPublicConfig_() {
  return {
    code: 'CONFIG',
    environment: setting_('ENVIRONMENT'),
    timezone: setting_('TIME_ZONE'),
    bookingHorizonDays: Number(setting_('BOOKING_WINDOW_DAYS')) || 14,
    bookingLeadMinutes: Number(setting_('BOOKING_LEAD_MINUTES')) || 120,
    weekendsClosed: true,
    emailVerificationRequired: emailVerificationRequired_(),
    candidateLoginRequired: false,
    ga4MeasurementId: setting_('GA4_MEASUREMENT_ID'),
    turnstileEnabled: settingBoolean_('TURNSTILE_ENABLED'),
    turnstileSiteKey: PropertiesService.getScriptProperties().getProperty('TURNSTILE_SITE_KEY') || ''
  };
}

function getReferenceData_() {
  var grouped = {};
  records_('Reference_Data').filter(function (row) { return isActiveFlag_(row.active); })
    .sort(function (a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); })
    .forEach(function (row) {
      if (!grouped[row.type]) grouped[row.type] = [];
      grouped[row.type].push({ value: row.value, label: row.label });
    });
  return { code: 'REFERENCE_DATA', items: grouped };
}

function getJobs_(params) {
  var page = Math.max(1, Number(params.page) || 1);
  var pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 20));
  var query = Core.cleanText(params.q).toLowerCase();
  var type = Core.cleanText(params.type).toLowerCase();
  var jobs = records_('Jobs').filter(function (row) {
    if (String(row.status).toUpperCase() !== 'ACTIVE') return false;
    if (type && String(row.employmentType).toLowerCase() !== type) return false;
    if (!query) return true;
    return [row.company, row.title, row.location, row.skills, row.description].join(' ').toLowerCase().indexOf(query) !== -1;
  }).sort(function (a, b) { return String(b.postedDate).localeCompare(String(a.postedDate)); });
  var total = jobs.length;
  var start = (page - 1) * pageSize;
  var items = jobs.slice(start, start + pageSize).map(function (row) {
    var applyUrl = /^https:\/\//i.test(row.applyUrl) ? row.applyUrl : '';
    return {
      id: row.jobId, company: row.company, title: row.title, experience: row.experience,
      location: row.location,
      skills: String(row.skills || '').split(/[,;|]/).map(function (value) { return value.trim(); }).filter(Boolean),
      employmentType: row.employmentType,
      salary: row.salary, description: row.description, applyUrl: applyUrl, postedDate: row.postedDate
    };
  });
  return { code: 'JOBS', items: items, page: page, pageSize: pageSize, total: total, totalPages: Math.ceil(total / pageSize) };
}
