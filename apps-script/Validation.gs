function collectFieldError_(errors, field, message) {
  if (message) errors[field] = message;
}

function assertCandidatePayload_(candidate) {
  var input = candidate || {};
  var errors = {};
  collectFieldError_(errors, 'fullName', Core.validateName(input.fullName));
  collectFieldError_(errors, 'email', Core.validateEmail(input.email));
  collectFieldError_(errors, 'emailId', Core.validateEmail(input.emailId));
  collectFieldError_(errors, 'mobileNumber', Core.validatePhone(input.mobileNumber));
  collectFieldError_(errors, 'whatsappNumber', Core.validatePhone(input.whatsappNumber));

  var gender = Core.cleanText(input.gender);
  if (['Male', 'Female'].indexOf(gender) === -1) errors.gender = 'Select a valid gender.';
  var education = Core.cleanText(input.education);
  if (['B.tech', 'BE', 'MCA', 'BCA', 'MBA', 'M.tech', 'others'].indexOf(education) === -1) {
    errors.education = 'Select a valid education.';
  }
  var passoutYear = String(input.passoutYear || '');
  if (['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015'].indexOf(passoutYear) === -1) {
    errors.passoutYear = 'Select a valid passout year.';
  }
  collectFieldError_(errors, 'collegeName', Core.validateHumanText(input.collegeName, 'College name', 3, 120, true));
  var experienceLevel = Core.cleanText(input.experienceLevel);
  if (['Fresher', '1 Year', '2 Year', '3 Year', '4 Year', '5 Year', '6 Year', '7 Years', '8 Years', '9 Years', '10 Years', 'Others'].indexOf(experienceLevel) === -1) {
    errors.experienceLevel = 'Select a valid experience level.';
  }
  collectFieldError_(errors, 'currentAddress', Core.validateHumanText(input.currentAddress, 'Current address', 8, 250, true));
  collectFieldError_(errors, 'currentCompany', Core.validateHumanText(input.currentCompany, 'Current company', 2, 120, true));
  collectFieldError_(errors, 'currentCtc', Core.validateHumanText(input.currentCtc, 'Current CTC', 1, 40, true));
  collectFieldError_(errors, 'expectedCtc', Core.validateHumanText(input.expectedCtc, 'Expected CTC', 1, 40, true));
  var noticePeriod = Core.cleanText(input.noticePeriod);
  if (['Immediate Joiner', '15 Days', '30 Days', '60 Days', 'Serving Notice Period'].indexOf(noticePeriod) === -1) {
    errors.noticePeriod = 'Select a valid notice period.';
  }
  if (input.consent !== true) errors.consent = 'Consent is required to register.';
  if (Object.keys(errors).length) throw appError_('VALIDATION_FAILED', 'Please correct the highlighted fields.', errors);

  return {
    fullName: Core.cleanText(input.fullName),
    email: Core.normalizeEmail(input.email),
    emailId: Core.normalizeEmail(input.emailId),
    mobileNumber: Core.normalizePhone(input.mobileNumber),
    whatsappNumber: Core.normalizePhone(input.whatsappNumber),
    gender: gender,
    education: education,
    passoutYear: passoutYear,
    collegeName: Core.cleanText(input.collegeName),
    experienceLevel: experienceLevel,
    currentAddress: Core.cleanText(input.currentAddress),
    currentCompany: Core.cleanText(input.currentCompany),
    currentCtc: Core.cleanText(input.currentCtc),
    expectedCtc: Core.cleanText(input.expectedCtc),
    noticePeriod: noticePeriod,
    source: Core.cleanText(input.source || 'WEBSITE').slice(0, 40)
  };
}

function assertBookingPayload_(booking) {
  var input = booking || {};
  var errors = {};
  if (!/^SK[1-9]\d{0,11}$/i.test(String(input.skId || ''))) errors.skId = 'Enter a valid SK ID, for example SK1.';
  collectFieldError_(errors, 'email', Core.validateEmail(input.email));
  collectFieldError_(errors, 'fullName', Core.validateName(input.fullName));
  var batch = String(input.batch || '');
  if (['1', '2', '3', '4'].indexOf(batch) === -1) errors.batch = 'Select a valid batch.';
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(String(input.panelId || ''))) errors.panelId = 'Select an available panel.';
  if (!Core.isIsoDate(input.date)) errors.date = 'Select a valid interview date.';
  if (!Core.isTime(input.startTime)) errors.startTime = 'Select a valid start time.';
  if (!Core.isTime(input.endTime)) errors.endTime = 'Select a valid end time.';
  if (Core.isTime(input.startTime) && Core.isTime(input.endTime) && Core.timeToMinutes(input.endTime) <= Core.timeToMinutes(input.startTime)) {
    errors.endTime = 'The end time must be after the start time.';
  }
  var round = Core.cleanText(input.round);
  var rounds = ['Assessment', 'AI Assessment', 'Round 1', 'Round 2', 'Round 3', 'Round 4',
    'Reschedule Round 1', 'Reschedule Round 2', 'Reschedule Round 3', 'Reschedule Round 4',
    'HR Manager Round', 'AI Interview', 'Interview Supporter not available'];
  if (rounds.indexOf(round) === -1) errors.round = 'Select a valid interview round.';
  collectFieldError_(errors, 'technology', Core.validateHumanText(input.technology, 'Technology', 2, 80, true));
  collectFieldError_(errors, 'company', Core.validateHumanText(input.company, 'Company', 2, 120, true));

  collectFieldError_(errors, 'hrName', Core.validateName(input.hrName));
  collectFieldError_(errors, 'hrPhone', Core.validatePhone(input.hrPhone));
  collectFieldError_(errors, 'hrEmail', Core.validateEmail(input.hrEmail));

  if (Core.isIsoDate(input.date)) {
    var today = todayLocal_();
    if (input.date < today) errors.date = 'Past dates cannot be booked.';
    var max = addDaysToIsoDate_(today, Number(setting_('BOOKING_WINDOW_DAYS')) || 14);
    if (input.date > max) errors.date = 'This date is outside the booking window.';
  }
  if (Object.keys(errors).length) throw appError_('VALIDATION_FAILED', 'Please correct the highlighted fields.', errors);

  return {
    skId: String(input.skId).toUpperCase(),
    email: Core.normalizeEmail(input.email),
    fullName: Core.cleanText(input.fullName),
    batch: batch,
    panelId: String(input.panelId),
    date: String(input.date),
    startTime: String(input.startTime),
    endTime: String(input.endTime),
    round: round,
    technology: Core.cleanText(input.technology),
    company: Core.cleanText(input.company),
    hrName: Core.cleanText(input.hrName),
    hrPhone: Core.normalizePhone(input.hrPhone),
    hrEmail: Core.normalizeEmail(input.hrEmail)
  };
}

function assertReschedulePayload_(newSchedule) {
  var input = newSchedule || {};
  var errors = {};
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(String(input.panelId || ''))) errors.panelId = 'Select an available panel.';
  if (!Core.isIsoDate(input.date)) errors.date = 'Select a valid interview date.';
  if (!Core.isTime(input.startTime)) errors.startTime = 'Select a valid start time.';
  if (!Core.isTime(input.endTime)) errors.endTime = 'Select a valid end time.';
  if (Core.isTime(input.startTime) && Core.isTime(input.endTime) && Core.timeToMinutes(input.endTime) <= Core.timeToMinutes(input.startTime)) {
    errors.endTime = 'The end time must be after the start time.';
  }
  if (Core.isIsoDate(input.date)) {
    var today = todayLocal_();
    if (input.date < today) errors.date = 'Past dates cannot be booked.';
    var max = addDaysToIsoDate_(today, Number(setting_('BOOKING_WINDOW_DAYS')) || 14);
    if (input.date > max) errors.date = 'This date is outside the booking window.';
  }
  if (Object.keys(errors).length) throw appError_('VALIDATION_FAILED', 'Please correct the highlighted fields.', errors);
  return {
    panelId: String(input.panelId), date: String(input.date),
    startTime: String(input.startTime), endTime: String(input.endTime)
  };
}

function addDaysToIsoDate_(dateString, days) {
  var parts = dateString.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days), 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function assertSimpleReason_(value) {
  var reason = Core.cleanText(value);
  if (!reason || reason.length < 3 || reason.length > 300 || Core.containsPlaceholder(reason)) {
    throw appError_('VALIDATION_FAILED', 'Enter a short, meaningful reason.', { reason: 'Enter a short, meaningful reason.' });
  }
  return reason;
}
