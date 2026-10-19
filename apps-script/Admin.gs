function assertAdmin_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  var configured = getSpreadsheet_();
  if (active && active.getId() !== configured.getId()) {
    throw appError_('ADMIN_CONTEXT_REQUIRED', 'Open the configured staging workbook to use admin controls.');
  }
  var email = Core.normalizeEmail(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail());
  var allowlist = String(setting_('ADMIN_ALLOWLIST') || '').split(',').map(Core.normalizeEmail).filter(Boolean);
  var domain = String(setting_('ADMIN_DOMAIN') || '').toLowerCase().replace(/^@/, '');
  if (allowlist.length && allowlist.indexOf(email) === -1) throw appError_('ADMIN_FORBIDDEN', 'You are not authorized to manage availability.');
  if (domain && email.split('@')[1] !== domain && allowlist.indexOf(email) === -1) {
    throw appError_('ADMIN_FORBIDDEN', 'You are not authorized to manage availability.');
  }
  if (!email) throw appError_('ADMIN_IDENTITY_UNAVAILABLE', 'Sign in with the Google account that owns or edits this staging workbook.');
  return email;
}

function assertAdminUiContext_() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active || active.getId() !== getSpreadsheet_().getId()) {
    throw appError_('ADMIN_CONTEXT_REQUIRED', 'Open the configured staging workbook to use admin controls.');
  }
}

function showAdminSidebar() {
  assertAdmin_();
  assertAdminUiContext_();
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('AdminSidebar').setTitle('Availability controls'));
}

function adminGetBootstrap() {
  assertAdmin_();
  return {
    timezone: setting_('TIME_ZONE'),
    panels: records_('Panels').filter(function (row) { return isActiveFlag_(row.active); }).map(function (row) {
      return { panelId: row.panelId, label: row.publicLabel };
    }),
    blocks: records_('Slot_Blocks').slice(-100).reverse().map(adminRuleView_),
    specialOpens: records_('Special_Open_Dates').slice(-100).reverse().map(adminRuleView_)
  };
}

function adminAddSlotBlock(input) {
  var actor = assertAdmin_();
  var payload = input || {};
  var dates = assertAdminDatesAndTimes_(payload);
  var requestedScope = String(payload.scope || '').toUpperCase();
  var scope = normalizeBlockScope_(requestedScope, dates);
  var panelScoped = scope.indexOf('PANEL_') === 0 || (scope === 'DATE_RANGE' && Boolean(payload.panelId));
  if (panelScoped && !findRecord_('Panels', 'panelId', String(payload.panelId || ''))) {
    throw appError_('VALIDATION_FAILED', 'Choose a valid panel.');
  }
  var reason = assertSimpleReason_(payload.reason);
  return withAdminLock_(function () {
    var id = allocateIdUnlocked_('block');
    appendRecord_('Slot_Blocks', {
      createdAt: nowIso_(), blockId: id, scope: scope,
      panelId: panelScoped ? String(payload.panelId) : '',
      dateFrom: dates.dateFrom, dateTo: dates.dateTo,
      startTime: dates.startTime, endTime: dates.endTime,
      reason: reason, active: 'TRUE', createdBy: actor
    });
    auditUnlocked_('SLOT_BLOCK_CREATED', actor, 'SLOT_BLOCK', id, '', 'SUCCESS', {
      scope: scope, panelId: payload.panelId || '', dateFrom: dates.dateFrom, dateTo: dates.dateTo
    });
    return { ok: true, id: id };
  });
}

function normalizeBlockScope_(requestedScope, dates) {
  var exact = ['PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'];
  if (exact.indexOf(requestedScope) !== -1) {
    if (/_SLOT$/.test(requestedScope) && !dates.startTime) {
      throw appError_('VALIDATION_FAILED', 'A slot block requires a start and end time.');
    }
    if (/_DAY$/.test(requestedScope) && (dates.startTime || dates.dateFrom !== dates.dateTo)) {
      throw appError_('VALIDATION_FAILED', 'A day block must be one full day. Use DATE_RANGE for multiple days.');
    }
    if (requestedScope === 'DATE_RANGE' && dates.dateFrom === dates.dateTo) {
      throw appError_('VALIDATION_FAILED', 'A date-range block must include more than one day.');
    }
    return requestedScope;
  }
  if (['ALL', 'PANEL'].indexOf(requestedScope) === -1) {
    throw appError_('VALIDATION_FAILED', 'Choose all panels or one panel.');
  }
  if (dates.dateFrom !== dates.dateTo) return 'DATE_RANGE';
  if (requestedScope === 'PANEL') return dates.startTime ? 'PANEL_SLOT' : 'PANEL_DAY';
  return dates.startTime ? 'GLOBAL_SLOT' : 'GLOBAL_DAY';
}

function adminAddSpecialOpen(input) {
  var actor = assertAdmin_();
  var payload = input || {};
  if (payload.panelId && !findRecord_('Panels', 'panelId', String(payload.panelId))) {
    throw appError_('VALIDATION_FAILED', 'Choose a valid panel.');
  }
  var dates = assertAdminDatesAndTimes_(payload);
  var reason = assertSimpleReason_(payload.reason);
  return withAdminLock_(function () {
    var id = allocateIdUnlocked_('override');
    appendRecord_('Special_Open_Dates', {
      createdAt: nowIso_(), overrideId: id, panelId: String(payload.panelId || ''),
      dateFrom: dates.dateFrom, dateTo: dates.dateTo,
      startTime: dates.startTime, endTime: dates.endTime,
      reason: reason, active: 'TRUE', createdBy: actor
    });
    auditUnlocked_('SPECIAL_OPEN_CREATED', actor, 'SPECIAL_OPEN', id, '', 'SUCCESS', {
      panelId: payload.panelId || '', dateFrom: dates.dateFrom, dateTo: dates.dateTo
    });
    return { ok: true, id: id };
  });
}

function adminSetRuleActive(input) {
  var actor = assertAdmin_();
  var payload = input || {};
  var table = payload.kind === 'SPECIAL_OPEN' ? 'Special_Open_Dates' : 'Slot_Blocks';
  var idColumn = table === 'Special_Open_Dates' ? 'overrideId' : 'blockId';
  var record = findRecord_(table, idColumn, String(payload.id || ''));
  if (!record) throw appError_('NOT_FOUND', 'The availability rule was not found.');
  return withAdminLock_(function () {
    updateRecord_(table, record._row, { active: payload.active ? 'TRUE' : 'FALSE' });
    auditUnlocked_('AVAILABILITY_RULE_UPDATED', actor, payload.kind || 'SLOT_BLOCK', payload.id, '', 'SUCCESS', {
      active: Boolean(payload.active)
    });
    return { ok: true };
  });
}

function assertAdminDatesAndTimes_(payload) {
  var dateFrom = String(payload.dateFrom || '');
  var dateTo = String(payload.dateTo || dateFrom);
  if (!Core.isIsoDate(dateFrom) || !Core.isIsoDate(dateTo) || dateTo < dateFrom) {
    throw appError_('VALIDATION_FAILED', 'Enter a valid date or date range.');
  }
  var start = String(payload.startTime || '');
  var end = String(payload.endTime || '');
  if ((start || end) && (!Core.isTime(start) || !Core.isTime(end) || Core.timeToMinutes(end) <= Core.timeToMinutes(start))) {
    throw appError_('VALIDATION_FAILED', 'Enter both a valid start and end time, or leave both blank for all day.');
  }
  return { dateFrom: dateFrom, dateTo: dateTo, startTime: start, endTime: end };
}

function withAdminLock_(handler) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw appError_('BUSY', 'The workbook is busy. Try again shortly.');
  try { return handler(); } finally { lock.releaseLock(); }
}

function adminRuleView_(row) {
  return {
    id: row.blockId || row.overrideId,
    scope: row.scope || (row.panelId ? 'PANEL' : 'ALL'),
    panelId: row.panelId || '', dateFrom: row.dateFrom, dateTo: row.dateTo,
    startTime: row.startTime, endTime: row.endTime, reason: row.reason,
    active: isActiveFlag_(row.active), createdBy: row.createdBy
  };
}
