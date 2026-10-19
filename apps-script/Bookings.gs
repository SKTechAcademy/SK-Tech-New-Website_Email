function bookInterview_(payload) {
  assertHumanRequest_(payload);
  return withIdempotency_(payload.requestId, 'bookInterview', payload, function () {
    if (!settingBoolean_('BOOKING_EMAIL_ENABLED')) {
      throw appError_('EMAIL_DISABLED', 'Interview booking is temporarily unavailable.');
    }
    var booking = assertBookingPayload_(payload.booking);
    var candidate = findRecord_('Candidates', 'candidateId', booking.skId);
    var emailMatches = candidate && (candidate.emailNormalized === booking.email || candidate.emailIdNormalized === booking.email);
    var nameMatches = candidate && Core.cleanText(candidate.fullName).toLowerCase() === booking.fullName.toLowerCase();
    if (!candidate || candidate.status !== 'REGISTERED' || !emailMatches || !nameMatches) {
      throw appError_('CANDIDATE_NOT_VERIFIED', 'The SK ID, full name and verified email could not be confirmed.');
    }
    consumeEmailVerificationUnlocked_(payload.verificationToken, booking.email, 'BOOKING');
    var selected = assertSlotAvailableUnlocked_(booking, '');
    var bookingId = allocateIdUnlocked_('booking');
    var publicReference = ('BR-' + hash_(bookingId + '|' + randomToken_()).slice(0, 24)).toUpperCase();
    var manageToken = 'BM-' + randomToken_();
    var createdAt = nowIso_();
    appendRecord_('Interview_Bookings', {
      createdAt: createdAt,
      bookingId: bookingId,
      publicReference: publicReference,
      candidateId: candidate.candidateId,
      candidateEmail: booking.email,
      candidateName: candidate.fullName,
      batch: booking.batch,
      panelId: booking.panelId,
      panelLabel: selected.panelLabel,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: setting_('TIME_ZONE'),
      round: booking.round,
      technology: booking.technology,
      company: booking.company,
      hrName: booking.hrName,
      hrPhone: booking.hrPhone,
      hrEmail: booking.hrEmail,
      status: 'SCHEDULED',
      previousBookingId: '',
      rootBookingId: bookingId,
      manageTokenHash: hash_(manageToken),
      requestId: payload.requestId,
      version: 1,
      updatedAt: createdAt
    });
    appendBookingHistoryUnlocked_({
      bookingId: bookingId, rootBookingId: bookingId, eventType: 'BOOKED',
      statusFrom: '', statusTo: 'SCHEDULED', actor: 'PUBLIC', requestId: payload.requestId,
      beforeJson: {}, afterJson: publicBookingSnapshot_(bookingId), reason: ''
    });
    var operationToken = createOperationUnlocked_('bookInterview', bookingId);
    queueBookingEmailsUnlocked_('BOOKING', {
      fullName: candidate.fullName,
      candidateId: candidate.candidateId,
      emailNormalized: booking.email
    }, {
      bookingId: bookingId, publicReference: publicReference, manageToken: manageToken,
      panelLabel: selected.panelLabel, date: booking.date, startTime: booking.startTime,
      endTime: booking.endTime, batch: booking.batch, round: booking.round, technology: booking.technology,
      company: booking.company
    }, payload.requestId, operationToken);
    auditUnlocked_('INTERVIEW_BOOKED', 'PUBLIC', 'BOOKING', bookingId, payload.requestId, 'SUCCESS', {
      panelId: booking.panelId, date: booking.date
    });
    return {
      code: 'BOOKING_CONFIRMED', operationToken: operationToken,
      status: 'CONFIRMED', emailQueued: true, _resourceId: bookingId
    };
  });
}

function bookingLookup_(payload) {
  var reference = String(payload.publicReference || '').toUpperCase();
  var token = String(payload.manageToken || '');
  if (!/^BR-[A-Za-z0-9_-]{20,30}$/.test(reference) || !/^BM-[A-Za-z0-9]{50,80}$/.test(token)) {
    throw appError_('BOOKING_NOT_FOUND', 'The booking could not be found.');
  }
  checkRateLimit_('booking-lookup', reference, 20, 3600);
  var booking = findRecord_('Interview_Bookings', 'publicReference', reference);
  if (!booking || booking.manageTokenHash !== hash_(token)) {
    throw appError_('BOOKING_NOT_FOUND', 'The booking could not be found.');
  }
  return {
    code: 'BOOKING_FOUND',
    publicReference: booking.publicReference,
    status: booking.status,
    panelLabel: booking.panelLabel,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    timezone: booking.timezone,
    round: booking.round,
    technology: booking.technology,
    company: booking.company,
    version: Number(booking.version || 1)
  };
}

function rescheduleInterview_(payload) {
  assertHumanRequest_(payload);
  return withIdempotency_(payload.requestId, 'rescheduleInterview', payload, function () {
    if (!settingBoolean_('RESCHEDULE_EMAIL_ENABLED')) {
      throw appError_('EMAIL_DISABLED', 'Interview rescheduling is temporarily unavailable.');
    }
    var reference = String(payload.publicReference || '').toUpperCase();
    var manageToken = String(payload.manageToken || '');
    var current = findRecord_('Interview_Bookings', 'publicReference', reference);
    if (!current || current.manageTokenHash !== hash_(manageToken) || ['SCHEDULED', 'CONFIRMED'].indexOf(current.status) === -1) {
      throw appError_('BOOKING_NOT_RESCHEDULABLE', 'This booking cannot be rescheduled from this link.');
    }
    var schedule = assertReschedulePayload_(payload.newSchedule);
    var selected = assertSlotAvailableUnlocked_(schedule, current.bookingId);
    var reason = assertSimpleReason_(payload.reason);
    var newBookingId = allocateIdUnlocked_('booking');
    var newReference = ('BR-' + hash_(newBookingId + '|' + randomToken_()).slice(0, 24)).toUpperCase();
    var newManageToken = 'BM-' + randomToken_();
    var timestamp = nowIso_();
    var newRow = appendRecord_('Interview_Bookings', {
      createdAt: timestamp,
      bookingId: newBookingId,
      publicReference: newReference,
      candidateId: current.candidateId,
      candidateEmail: current.candidateEmail,
      candidateName: current.candidateName,
      batch: current.batch,
      panelId: schedule.panelId,
      panelLabel: selected.panelLabel,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      timezone: setting_('TIME_ZONE'),
      round: current.round,
      technology: current.technology,
      company: current.company,
      hrName: current.hrName,
      hrPhone: current.hrPhone,
      hrEmail: current.hrEmail,
      status: 'PENDING_RESCHEDULE',
      previousBookingId: current.bookingId,
      rootBookingId: current.rootBookingId || current.bookingId,
      manageTokenHash: hash_(newManageToken),
      requestId: payload.requestId,
      version: Number(current.version || 1) + 1,
      updatedAt: timestamp
    });
    updateRecord_('Interview_Bookings', current._row, { status: 'RESCHEDULED', updatedAt: timestamp });
    updateRecord_('Interview_Bookings', newRow, { status: 'SCHEDULED', updatedAt: timestamp });
    appendBookingHistoryUnlocked_({
      bookingId: newBookingId,
      rootBookingId: current.rootBookingId || current.bookingId,
      eventType: 'RESCHEDULED', statusFrom: current.status, statusTo: 'SCHEDULED',
      actor: 'PUBLIC', requestId: payload.requestId,
      beforeJson: bookingSnapshotFromRecord_(current),
      afterJson: publicBookingSnapshot_(newBookingId),
      reason: reason
    });
    var operationToken = createOperationUnlocked_('rescheduleInterview', newBookingId);
    queueBookingEmailsUnlocked_('RESCHEDULE', {
      fullName: current.candidateName,
      emailNormalized: current.candidateEmail,
      candidateId: current.candidateId
    }, {
      bookingId: newBookingId, publicReference: newReference, manageToken: newManageToken,
      panelLabel: selected.panelLabel, date: schedule.date, startTime: schedule.startTime,
      endTime: schedule.endTime, batch: current.batch, round: current.round, technology: current.technology,
      company: current.company, previousDate: current.date, previousStartTime: current.startTime,
      previousEndTime: current.endTime
    }, payload.requestId, operationToken);
    auditUnlocked_('INTERVIEW_RESCHEDULED', 'PUBLIC', 'BOOKING', newBookingId, payload.requestId, 'SUCCESS', {
      previousBookingId: current.bookingId, panelId: schedule.panelId, date: schedule.date
    });
    return {
      code: 'RESCHEDULE_CONFIRMED', operationToken: operationToken,
      status: 'RESCHEDULED', emailQueued: true, _resourceId: newBookingId
    };
  });
}

function appendBookingHistoryUnlocked_(event) {
  appendRecord_('Booking_History', {
    eventAt: nowIso_(), eventId: allocateIdUnlocked_('history'), bookingId: event.bookingId,
    rootBookingId: event.rootBookingId, eventType: event.eventType,
    statusFrom: event.statusFrom, statusTo: event.statusTo, actor: event.actor,
    requestId: event.requestId, beforeJson: JSON.stringify(event.beforeJson || {}),
    afterJson: JSON.stringify(event.afterJson || {}), reason: event.reason || ''
  });
}

function publicBookingSnapshot_(bookingId) {
  var booking = findRecord_('Interview_Bookings', 'bookingId', bookingId);
  return booking ? bookingSnapshotFromRecord_(booking) : {};
}

function bookingSnapshotFromRecord_(booking) {
  return {
    bookingId: booking.bookingId, panelId: booking.panelId, date: booking.date,
    startTime: booking.startTime, endTime: booking.endTime, status: booking.status,
    version: Number(booking.version || 1)
  };
}

function queueBookingEmailsUnlocked_(template, candidate, booking, requestId, operationToken) {
  var subject = template === 'RESCHEDULE' ? 'Your SK Tech interview was rescheduled' : 'Your SK Tech interview is booked';
  var payload = {
    fullName: candidate.fullName,
    candidateId: candidate.candidateId,
    bookingId: booking.bookingId,
    panelLabel: booking.panelLabel,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    batch: booking.batch,
    round: booking.round,
    technology: booking.technology,
    company: booking.company,
    publicReference: booking.publicReference,
    manageToken: booking.manageToken,
    manageUrl: buildManageUrl_(booking.publicReference, booking.manageToken),
    previousDate: booking.previousDate || '',
    previousStartTime: booking.previousStartTime || '',
    previousEndTime: booking.previousEndTime || '',
    supportEmail: setting_('SUPPORT_EMAIL')
  };
  queueEmailUnlocked_(template, candidate.emailNormalized, subject, payload, requestId, operationToken);
  String(setting_('BOOKING_NOTIFICATION_TO') || '').split(',').map(function (value) {
    return Core.normalizeEmail(value);
  }).filter(function (email) {
    return email && !Core.validateEmail(email);
  }).forEach(function (email) {
    queueEmailUnlocked_('INTERNAL_' + template, email, '[SK Tech] ' + subject, payload, requestId, operationToken);
  });
}

function buildManageUrl_(reference, token) {
  var base = String(setting_('WEBSITE_BASE_URL') || '').replace(/\/$/, '');
  if (!base) return '';
  return base + '/#manage=' + encodeURIComponent(reference + ':' + token);
}

function getOperationStatus_(token) {
  var value = String(token || '');
  if (!/^OP-[A-Za-z0-9]{20,40}$/.test(value)) throw appError_('OPERATION_NOT_FOUND', 'The operation could not be found.');
  var record = findRecord_('_Request_Log', 'operationToken', value);
  if (!record) throw appError_('OPERATION_NOT_FOUND', 'The operation could not be found.');
  return {
    code: 'OPERATION_STATUS',
    status: record.status === 'COMPLETE' ? 'CONFIRMED' : record.status,
    emailStatus: record.emailStatus || 'QUEUED'
  };
}
