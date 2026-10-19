function sheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw appError_('SCHEMA_MISSING', 'A required staging table is missing.');
  return sheet;
}

function headerMap_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) return {};
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var map = {};
  headers.forEach(function (header, index) { map[header] = index + 1; });
  return map;
}

function records_(name) {
  var sh = sheet_(name);
  if (sh.getLastRow() < 2) return [];
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var range = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length);
  var rows = range.getDisplayValues();
  var rawRows = range.getValues();
  return rows.map(function (row, index) {
    var record = { _row: index + 2 };
    headers.forEach(function (header, column) { record[header] = normalizeSheetValue_(header, row[column], rawRows[index][column]); });
    return record;
  });
}

// Typed Sheet columns render clock values using the workbook locale. Keep the
// API's canonical HH:mm representation independent of that display format.
function normalizeSheetValue_(header, value, rawValue) {
  // Never parse a locale-dependent date display (01/02 is ambiguous).
  if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) {
    if (['date', 'dateFrom', 'dateTo', 'effectiveFrom', 'effectiveTo'].indexOf(header) !== -1) {
      return Utilities.formatDate(rawValue, getSpreadsheet_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    }
    if (header === 'startTime' || header === 'endTime') {
      return Utilities.formatDate(rawValue, getSpreadsheet_().getSpreadsheetTimeZone(), 'HH:mm');
    }
  }
  if (header === 'startTime' || header === 'endTime') {
    var clock = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (clock) {
      var hour = Number(clock[1]);
      if (clock[3]) hour = hour % 12 + (clock[3].toLowerCase() === 'pm' ? 12 : 0);
      if (hour < 24 && Number(clock[2]) < 60) return ('0' + hour).slice(-2) + ':' + clock[2];
    }
  }
  return value;
}

function appendRecord_(name, record) {
  var headers = SK_SCHEMA[name];
  if (!headers) throw appError_('SCHEMA_UNKNOWN', 'A required staging table is not defined.');
  var row = headers.map(function (key) {
    var value = Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '';
    return Core.safeCell(value == null ? '' : value);
  });
  var sh = sheet_(name);
  sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  return sh.getLastRow();
}

function updateRecord_(name, rowNumber, patch) {
  var sh = sheet_(name);
  var map = headerMap_(sh);
  Object.keys(patch).forEach(function (key) {
    if (!map[key]) return;
    sh.getRange(rowNumber, map[key]).setValue(Core.safeCell(patch[key] == null ? '' : patch[key]));
  });
}

function findRecord_(name, column, value) {
  var sh = sheet_(name);
  var map = headerMap_(sh);
  if (!map[column] || sh.getLastRow() < 2) return null;
  var finder = sh.getRange(2, map[column], sh.getLastRow() - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext();
  if (!finder) return null;
  var rowNumber = finder.getRow();
  var range = sh.getRange(rowNumber, 1, 1, sh.getLastColumn());
  var values = range.getDisplayValues()[0];
  var rawValues = range.getValues()[0];
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var record = { _row: rowNumber };
  headers.forEach(function (header, index) { record[header] = normalizeSheetValue_(header, values[index], rawValues[index]); });
  return record;
}

function allocateIdUnlocked_(sequenceName) {
  var record = findRecord_('_Sequences', 'name', sequenceName);
  if (!record) throw appError_('SEQUENCE_MISSING', 'A required ID sequence is not configured.');
  var next = Number(record.nextValue);
  var width = Math.max(0, Number(record.padLength) || 0);
  if (!Number.isFinite(next) || next < 1) throw appError_('SEQUENCE_INVALID', 'A required ID sequence is invalid.');
  updateRecord_('_Sequences', record._row, { nextValue: next + 1 });
  var number = String(Math.floor(next));
  while (number.length < width) number = '0' + number;
  return String(record.prefix || '') + number;
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function bytesToBase64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function hash_(value) {
  var secret = PropertiesService.getScriptProperties().getProperty('HASH_SECRET');
  if (!secret) throw appError_('NOT_CONFIGURED', 'The application secret is missing.');
  return bytesToBase64Url_(Utilities.computeHmacSha256Signature(String(value), secret));
}

function fingerprint_(payload) {
  return hash_(Core.canonicalize(payload));
}

function randomDigits_(length) {
  var digest = Utilities.computeHmacSha256Signature(randomToken_(), hash_(nowIso_()));
  var digits = '';
  for (var i = 0; digits.length < length; i += 1) {
    var n = (digest[i % digest.length] + 256) % 256;
    digits += String(n % 10);
  }
  return digits.slice(0, length);
}

function createOperationUnlocked_(action, resourceId) {
  var rawToken = randomToken_();
  var token = 'OP-' + rawToken.slice(0, 32);
  return token;
}

function setOperationEmailStatus_(operationToken, status, errorCode) {
  if (!operationToken) return;
  var record = findRecord_('_Request_Log', 'operationToken', operationToken);
  if (!record) return;
  updateRecord_('_Request_Log', record._row, {
    emailStatus: status,
    errorCode: errorCode || record.errorCode || '',
    updatedAt: nowIso_()
  });
}

function auditUnlocked_(action, actor, resourceType, resourceId, requestId, outcome, metadata) {
  appendRecord_('_Audit_Log', {
    eventAt: nowIso_(),
    eventId: allocateIdUnlocked_('audit'),
    action: action,
    actor: actor || 'PUBLIC',
    resourceType: resourceType || '',
    resourceId: resourceId || '',
    requestId: requestId || '',
    outcome: outcome || 'SUCCESS',
    metadataJson: JSON.stringify(metadata || {})
  });
}

function assertRequestId_(requestId) {
  var id = String(requestId || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) {
    throw appError_('INVALID_REQUEST_ID', 'Create a new request and try again.', { requestId: 'A valid request ID is required.' });
  }
  return id;
}

function withIdempotency_(requestId, action, payload, handler) {
  var id = assertRequestId_(requestId);
  var input = JSON.parse(JSON.stringify(payload || {}));
  delete input.requestId;
  delete input.action;
  // The browser may add these only when retrying the same request through the
  // iframe transport after a CORS/network read failure. They are not business data.
  delete input.replyOrigin;
  delete input.nonce;
  delete input.transport;
  var fingerprint = fingerprint_(input);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw appError_('BUSY', 'The service is busy. Please try again shortly.');
  var idem;
  try {
    idem = findRecord_('_Request_Log', 'requestId', id);
    if (idem) {
      if (idem.action !== action || idem.fingerprint !== fingerprint) {
        throw appError_('REQUEST_ID_REUSED', 'This request ID was already used for different information.');
      }
      if (idem.status === 'COMPLETE') {
        try { return JSON.parse(idem.safeResultJson); } catch (ignore) {
          throw appError_('REPLAY_UNAVAILABLE', 'The original result could not be replayed.');
        }
      }
      if (idem.status === 'FAILED') {
        throw appError_(idem.errorCode || 'REQUEST_PREVIOUSLY_FAILED', 'This request did not complete. Submit again with a new request ID.');
      }
      throw appError_('REQUEST_IN_PROGRESS', 'This request is already being processed.');
    }

    var idemRow = appendRecord_('_Request_Log', {
      createdAt: nowIso_(), requestId: id, action: action, fingerprint: fingerprint,
      status: 'IN_PROGRESS', operationToken: '', resultCode: '', resourceId: '',
      safeResultJson: '', emailStatus: '', updatedAt: nowIso_(), errorCode: ''
    });

    try {
      var result = handler();
      updateRecord_('_Request_Log', idemRow, {
        status: 'COMPLETE',
        operationToken: result.operationToken || '',
        resultCode: result.code || 'OK',
        resourceId: result._resourceId || '',
        safeResultJson: JSON.stringify(stripPrivateResult_(result)),
        emailStatus: result.emailQueued ? 'QUEUED' : '',
        updatedAt: nowIso_(),
        errorCode: ''
      });
      return stripPrivateResult_(result);
    } catch (error) {
      updateRecord_('_Request_Log', idemRow, {
        status: 'FAILED', updatedAt: nowIso_(), errorCode: error.code || 'INTERNAL_ERROR'
      });
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

function stripPrivateResult_(result) {
  var safe = {};
  Object.keys(result || {}).forEach(function (key) {
    if (key.charAt(0) !== '_') safe[key] = result[key];
  });
  return safe;
}

function checkRateLimit_(bucket, key, limit, seconds) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'rate:' + bucket + ':' + hash_(key).slice(0, 24);
  var current = Number(cache.get(cacheKey) || 0);
  if (current >= limit) throw appError_('RATE_LIMITED', 'Too many requests. Please wait and try again.');
  cache.put(cacheKey, String(current + 1), seconds);
}
