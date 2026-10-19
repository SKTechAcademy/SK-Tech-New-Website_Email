function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SK Tech Staging')
    .addItem('Initialize blank staging workbook', 'promptInitializeStagingWorkbook')
    .addSeparator()
    .addItem('Open availability controls', 'showAdminSidebar')
    .addItem('Install email queue trigger', 'installEmailQueueTrigger')
    .addItem('Run readiness check', 'showReadinessReport')
    .addToUi();
}

function promptInitializeStagingWorkbook() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Initialize NEW staging workbook',
    'This is only for a new blank workbook. Type CREATE NEW STAGING to continue.',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() !== ui.Button.OK) return;
  initializeStagingWorkbook(result.getResponseText());
  ui.alert('Staging workbook initialized. Existing production data was not accessed.');
}

// Editor-safe entry point for this project's isolated staging workbook.
// Uses the configured ID, never a UI prompt or the currently selected sheet.
function setupStagingBackend() {
  var expectedId = '1wuXvUl6fGlV0Y4KnC5LW5edkh5-ECgJUbwkNnzUxa4Q';
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('SPREADSHEET_ID') !== expectedId) {
    throw appError_('WORKBOOK_MISMATCH', 'Configure the new staging spreadsheet ID before setup.');
  }
  var report = initializeStagingWorkbook('CREATE NEW STAGING');
  console.log(JSON.stringify(report));
  return report;
}

function initializeStagingWorkbook(confirmation) {
  if (confirmation !== 'CREATE NEW STAGING') {
    throw appError_('CONFIRMATION_REQUIRED', 'The exact staging confirmation phrase is required.');
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet() || getSpreadsheet_();
  if (!ss) throw appError_('NO_ACTIVE_WORKBOOK', 'Open the new staging workbook first.');
  var props = PropertiesService.getScriptProperties();
  var configured = props.getProperty('SPREADSHEET_ID');
  if (configured && configured !== ss.getId()) {
    throw appError_('WORKBOOK_MISMATCH', 'This script is already connected to a different workbook.');
  }

  var populated = ss.getSheets().some(function (sheet) {
    if (sheet.getLastRow() === 0) return false;
    if (sheet.getLastRow() === 1 && sheet.getLastColumn() === 1 && !sheet.getRange(1, 1).getDisplayValue()) return false;
    return true;
  });
  var recognizedSkeleton = populated && isRecognizedStagingSkeleton_(ss);
  if (populated && !props.getProperty('SCHEMA_VERSION') && !recognizedSkeleton) {
    throw appError_('WORKBOOK_NOT_BLANK', 'Initialization is restricted to a new blank staging workbook.');
  }

  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('HASH_SECRET')) props.setProperty('HASH_SECRET', randomToken_() + randomToken_());

  var first = ss.getSheets()[0];
  if (!ss.getSheetByName('Settings') && ss.getSheets().length === 1 && !first.getRange(1, 1).getDisplayValue()) {
    first.setName('Settings');
  }

  Object.keys(SK_SCHEMA).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var expected = SK_SCHEMA[name];
    if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
      var existing = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), expected.length)).getDisplayValues()[0];
      if (existing.some(function (value) { return value; }) && existing.join('|') !== expected.slice(0, existing.length).join('|')) {
        throw appError_('SCHEMA_CONFLICT', 'A staging tab has unexpected columns: ' + name);
      }
    }
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, expected.length)
      .setBackground('#162033')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sheet.autoResizeColumns(1, expected.length);
    if (SK_PRIVATE_SHEETS[name]) sheet.hideSheet();
  });

  seedSettings_();
  seedSequences_();
  seedPanels_();
  seedReferenceData_();
  // Imported staging sheets already carry native typed-table dropdown rules.
  // Apps Script setDataValidation cannot overwrite those typed columns.
  // Preserve their verified existing rules; seed rules only on a new blank sheet.
  if (!populated) applyStagingValidations_();
  props.setProperty('SCHEMA_VERSION', '1');
  clearSettingsCache_();
  SpreadsheetApp.flush();
  return getReadinessReport_();
}

function isRecognizedStagingSkeleton_(ss) {
  return ss.getSheets().every(function (sheet) {
    var name = sheet.getName();
    if (name === 'Control') return true;
    var expected = SK_SCHEMA[name];
    if (!expected) return false;
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() !== expected.length) return false;
    var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
    return actual.join('|') === expected.join('|');
  });
}

function seedSettings_() {
  var existing = {};
  records_('Settings').forEach(function (row) { existing[row.key] = true; });
  Object.keys(SK_DEFAULTS).forEach(function (key) {
    if (!existing[key]) appendRecord_('Settings', {
      key: key,
      value: SK_DEFAULTS[key],
      valueType: SK_SETTING_META[key][0],
      description: SK_SETTING_META[key][1],
      editable: SK_SETTING_META[key][2] ? 'TRUE' : 'FALSE'
    });
  });
}

function seedSequences_() {
  var seeds = [
    ['candidate', 1, 'SK', 0],
    ['booking', 1, 'TEST-BK-', 6],
    ['history', 1, 'EVT-', 8],
    ['block', 1, 'BLK-', 6],
    ['override', 1, 'OVR-', 6],
    ['email', 1, 'EML-', 8],
    ['audit', 1, 'AUD-', 8]
  ];
  var existing = {};
  records_('_Sequences').forEach(function (row) { existing[row.name] = true; });
  seeds.forEach(function (seed) {
    if (!existing[seed[0]]) appendRecord_('_Sequences', {
      name: seed[0], nextValue: seed[1], prefix: seed[2], padLength: seed[3]
    });
  });
}

function seedPanels_() {
  if (records_('Panels').length) return;
  appendRecord_('Panels', {
    panelId: 'PANEL-A', publicLabel: 'Interview Panel 1', internalName: 'Panel A',
    active: 'TRUE', weekdays: 'MON,TUE,WED,THU,FRI', startTime: '09:00', endTime: '18:00',
    slotMinutes: Number(setting_('DEFAULT_SLOT_MINUTES')) || 30,
    capacity: 1, effectiveFrom: todayLocal_(), effectiveTo: '2099-12-31'
  });
}

function seedReferenceData_() {
  if (records_('Reference_Data').length) return;
  [
    ['TECHNOLOGY', 'QA Engineer', 'QA Engineer', 'TRUE', 10],
    ['TECHNOLOGY', 'Data Engineer', 'Data Engineer', 'TRUE', 20],
    ['TECHNOLOGY', 'Full Stack Dot Net Developer', 'Full Stack Dot Net Developer', 'TRUE', 30],
    ['TECHNOLOGY', 'Java', 'Java', 'TRUE', 40],
    ['TECHNOLOGY', 'Python', 'Python', 'TRUE', 50],
    ['TECHNOLOGY', 'Interview Supporter not available', 'Interview Supporter not available', 'TRUE', 60],
    ['TECHNOLOGY', 'SAP', 'SAP', 'TRUE', 70],
    ['TECHNOLOGY', 'Other', 'Other', 'TRUE', 80],
    ['INTERVIEW_ROUND', 'Assessment', 'Assessment', 'TRUE', 10],
    ['INTERVIEW_ROUND', 'AI Assessment', 'AI Assessment', 'TRUE', 20],
    ['INTERVIEW_ROUND', 'Round 1', 'Round 1', 'TRUE', 30],
    ['INTERVIEW_ROUND', 'Round 2', 'Round 2', 'TRUE', 40],
    ['INTERVIEW_ROUND', 'Round 3', 'Round 3', 'TRUE', 50],
    ['INTERVIEW_ROUND', 'Round 4', 'Round 4', 'TRUE', 60],
    ['INTERVIEW_ROUND', 'Reschedule Round 1', 'Reschedule Round 1', 'TRUE', 70],
    ['INTERVIEW_ROUND', 'Reschedule Round 2', 'Reschedule Round 2', 'TRUE', 80],
    ['INTERVIEW_ROUND', 'Reschedule Round 3', 'Reschedule Round 3', 'TRUE', 90],
    ['INTERVIEW_ROUND', 'Reschedule Round 4', 'Reschedule Round 4', 'TRUE', 100],
    ['INTERVIEW_ROUND', 'HR Manager Round', 'HR Manager Round', 'TRUE', 110],
    ['INTERVIEW_ROUND', 'AI Interview', 'AI Interview', 'TRUE', 120],
    ['INTERVIEW_ROUND', 'Interview Supporter not available', 'Interview Supporter not available', 'TRUE', 130],
    ['BATCH', '1', '1', 'TRUE', 10], ['BATCH', '2', '2', 'TRUE', 20],
    ['BATCH', '3', '3', 'TRUE', 30], ['BATCH', '4', '4', 'TRUE', 40],
    ['GENDER', 'Male', 'Male', 'TRUE', 10],
    ['GENDER', 'Female', 'Female', 'TRUE', 20],
    ['EDUCATION', 'B.tech', 'B.tech', 'TRUE', 10],
    ['EDUCATION', 'BE', 'BE', 'TRUE', 20],
    ['EDUCATION', 'MCA', 'MCA', 'TRUE', 30],
    ['EDUCATION', 'BCA', 'BCA', 'TRUE', 40],
    ['EDUCATION', 'MBA', 'MBA', 'TRUE', 50],
    ['EDUCATION', 'M.tech', 'M.tech', 'TRUE', 60],
    ['EDUCATION', 'others', 'others', 'TRUE', 70],
    ['PASSOUT_YEAR', '2026', '2026', 'TRUE', 10],
    ['PASSOUT_YEAR', '2025', '2025', 'TRUE', 20],
    ['PASSOUT_YEAR', '2024', '2024', 'TRUE', 30],
    ['PASSOUT_YEAR', '2023', '2023', 'TRUE', 40],
    ['PASSOUT_YEAR', '2022', '2022', 'TRUE', 50],
    ['PASSOUT_YEAR', '2021', '2021', 'TRUE', 60],
    ['PASSOUT_YEAR', '2020', '2020', 'TRUE', 70],
    ['PASSOUT_YEAR', '2019', '2019', 'TRUE', 80],
    ['PASSOUT_YEAR', '2018', '2018', 'TRUE', 90],
    ['PASSOUT_YEAR', '2017', '2017', 'TRUE', 100],
    ['PASSOUT_YEAR', '2016', '2016', 'TRUE', 110],
    ['PASSOUT_YEAR', '2015', '2015', 'TRUE', 120],
    ['EXPERIENCE_LEVEL', 'Fresher', 'Fresher', 'TRUE', 10],
    ['EXPERIENCE_LEVEL', '1 Year', '1 Year', 'TRUE', 20],
    ['EXPERIENCE_LEVEL', '2 Year', '2 Year', 'TRUE', 30],
    ['EXPERIENCE_LEVEL', '3 Year', '3 Year', 'TRUE', 40],
    ['EXPERIENCE_LEVEL', '4 Year', '4 Year', 'TRUE', 50],
    ['EXPERIENCE_LEVEL', '5 Year', '5 Year', 'TRUE', 60],
    ['EXPERIENCE_LEVEL', '6 Year', '6 Year', 'TRUE', 70],
    ['EXPERIENCE_LEVEL', '7 Years', '7 Years', 'TRUE', 80],
    ['EXPERIENCE_LEVEL', '8 Years', '8 Years', 'TRUE', 90],
    ['EXPERIENCE_LEVEL', '9 Years', '9 Years', 'TRUE', 100],
    ['EXPERIENCE_LEVEL', '10 Years', '10 Years', 'TRUE', 110],
    ['EXPERIENCE_LEVEL', 'Others', 'Others', 'TRUE', 120],
    ['NOTICE_PERIOD', 'Immediate Joiner', 'Immediate Joiner', 'TRUE', 10],
    ['NOTICE_PERIOD', '15 Days', '15 Days', 'TRUE', 20],
    ['NOTICE_PERIOD', '30 Days', '30 Days', 'TRUE', 30],
    ['NOTICE_PERIOD', '60 Days', '60 Days', 'TRUE', 40],
    ['NOTICE_PERIOD', 'Serving Notice Period', 'Serving Notice Period', 'TRUE', 50]
  ].forEach(function (row) {
    appendRecord_('Reference_Data', {
      type: row[0], value: row[1], label: row[2], active: row[3], sortOrder: row[4]
    });
  });
}

function applyStagingValidations_() {
  var trueFalse = SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE'], true).build();
  ['Panels', 'Slot_Blocks', 'Special_Open_Dates', 'Reference_Data'].forEach(function (name) {
    var sh = sheet_(name);
    var map = headerMap_(sh);
    if (map.active) sh.getRange(2, map.active, Math.max(1, sh.getMaxRows() - 1), 1).setDataValidation(trueFalse);
  });
  var blockScope = SpreadsheetApp.newDataValidation().requireValueInList([
    'PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'
  ], true).build();
  sheet_('Slot_Blocks').getRange(2, headerMap_(sheet_('Slot_Blocks')).scope, Math.max(1, sheet_('Slot_Blocks').getMaxRows() - 1), 1).setDataValidation(blockScope);
  var settings = sheet_('Settings');
  var settingsMap = headerMap_(settings);
  settings.getRange(2, settingsMap.editable, Math.max(1, settings.getMaxRows() - 1), 1).setDataValidation(trueFalse);
  var valueTypes = SpreadsheetApp.newDataValidation().requireValueInList(['string', 'integer', 'boolean', 'csv'], true).build();
  settings.getRange(2, settingsMap.valueType, Math.max(1, settings.getMaxRows() - 1), 1).setDataValidation(valueTypes);
}

function installEmailQueueTrigger() {
  assertAdmin_();
  var exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'processEmailQueue';
  });
  if (!exists) ScriptApp.newTrigger('processEmailQueue').timeBased().everyMinutes(1).create();
  return { installed: true, alreadyExisted: exists };
}

function getReadinessReport_() {
  var ss = getSpreadsheet_();
  var missingSheets = Object.keys(SK_SCHEMA).filter(function (name) { return !ss.getSheetByName(name); });
  var props = PropertiesService.getScriptProperties();
  var settings = getSettings_();
  var candidateSequence = findRecord_('_Sequences', 'name', 'candidate');
  var bookingSequence = findRecord_('_Sequences', 'name', 'booking');
  var emailTriggerInstalled = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === 'processEmailQueue';
  });
  var blockers = [];
  if (missingSheets.length) blockers.push('Missing schema tabs');
  if (!props.getProperty('HASH_SECRET')) blockers.push('HASH_SECRET is missing');
  if (!props.getProperty('UPLOADS_FOLDER_ID')) blockers.push('UPLOADS_FOLDER_ID is missing');
  if (settings.ENVIRONMENT !== 'STAGING') blockers.push('ENVIRONMENT must remain STAGING during this phase');
  if (!candidateSequence || candidateSequence.prefix !== 'SK' || Number(candidateSequence.padLength) !== 0) blockers.push('Candidate sequence must use SK1, SK2, SK3 format');
  if (!bookingSequence || !/^TEST-BK/.test(bookingSequence.prefix)) blockers.push('Booking sequence prefix is not staging-safe');
  if (!settings.STAGING_EMAIL_ALLOWLIST && !settings.STAGING_EMAIL_ALLOWED_DOMAINS) blockers.push('Staging email restrictions are empty');
  if (!settingBoolean_('REGISTRATION_EMAIL_ENABLED')) blockers.push('Registration email is disabled');
  if (!settingBoolean_('BOOKING_EMAIL_ENABLED')) blockers.push('Booking email is disabled');
  if (!settingBoolean_('RESCHEDULE_EMAIL_ENABLED')) blockers.push('Reschedule email is disabled');
  if (!settings.WEBSITE_BASE_URL) blockers.push('WEBSITE_BASE_URL is empty');
  if (!settings.ALLOWED_WEB_ORIGINS) blockers.push('ALLOWED_WEB_ORIGINS is empty');
  if (!settings.GA4_MEASUREMENT_ID) blockers.push('GA4_MEASUREMENT_ID is empty');
  if (!emailTriggerInstalled) blockers.push('Email queue trigger is not installed');
  return {
    readyForStaging: blockers.length === 0,
    environment: settings.ENVIRONMENT,
    stagingIdPrefix: candidateSequence ? candidateSequence.prefix : '',
    missingSheets: missingSheets,
    secretConfigured: Boolean(props.getProperty('HASH_SECRET')),
    uploadsFolderConfigured: Boolean(props.getProperty('UPLOADS_FOLDER_ID')),
    emailTriggerInstalled: emailTriggerInstalled,
    blockers: blockers,
    productionDataAccessed: false
  };
}

function showReadinessReport() {
  assertAdmin_();
  assertAdminUiContext_();
  SpreadsheetApp.getUi().alert(JSON.stringify(getReadinessReport_(), null, 2));
}
