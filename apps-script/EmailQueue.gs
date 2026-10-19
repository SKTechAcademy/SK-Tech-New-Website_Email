function queueEmailUnlocked_(template, recipient, subject, payload, requestId, operationToken) {
  var email = Core.normalizeEmail(recipient);
  if (Core.validateEmail(email)) throw appError_('EMAIL_QUEUE_FAILED', 'A confirmation email could not be queued.');
  var emailId = allocateIdUnlocked_('email');
  appendRecord_('_Email_Queue', {
    createdAt: nowIso_(), emailId: emailId, template: template, recipient: email,
    subject: String(subject || '').replace(/[\r\n]+/g, ' ').slice(0, 160),
    payloadJson: JSON.stringify(payload || {}), status: 'PENDING', attempts: 0,
    nextAttemptAt: nowIso_(), lastAttemptAt: '', errorCode: '', requestId: requestId || '',
    operationToken: operationToken || '', sentAt: ''
  });
  return emailId;
}

function processEmailQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { processed: 0, skipped: 'BUSY' };
  var processed = 0;
  try {
    recoverUncertainEmailsUnlocked_();
    var now = Date.now();
    records_('_Email_Queue').filter(function (row) {
      return row.status === 'PENDING' && (!row.nextAttemptAt || new Date(row.nextAttemptAt).getTime() <= now);
    }).slice(0, 20).forEach(function (row) {
      deliverQueuedEmailUnlocked_(row);
      processed += 1;
    });
    return { processed: processed };
  } finally {
    lock.releaseLock();
  }
}

function recoverUncertainEmailsUnlocked_() {
  var cutoff = Date.now() - 15 * 60000;
  records_('_Email_Queue').filter(function (row) {
    return row.status === 'ATTEMPTING' && row.lastAttemptAt && new Date(row.lastAttemptAt).getTime() < cutoff;
  }).forEach(function (row) {
    updateRecord_('_Email_Queue', row._row, { status: 'UNKNOWN', errorCode: 'DELIVERY_OUTCOME_UNKNOWN' });
    appendEmailLogUnlocked_(row, 'UNKNOWN', 'Delivery may have completed before execution stopped.', 'DELIVERY_OUTCOME_UNKNOWN');
    refreshOperationEmailStatusUnlocked_(row.operationToken);
  });
}

function deliverQueuedEmailUnlocked_(row) {
  if (!isStagingRecipientAllowed_(row.recipient)) {
    updateRecord_('_Email_Queue', row._row, {
      status: 'SUPPRESSED', nextAttemptAt: '', errorCode: 'STAGING_RECIPIENT_NOT_ALLOWED'
    });
    appendEmailLogUnlocked_(row, 'SUPPRESSED', 'Recipient is outside the staging allowlist.', 'STAGING_RECIPIENT_NOT_ALLOWED');
    refreshOperationEmailStatusUnlocked_(row.operationToken);
    return;
  }
  var attempts = Number(row.attempts || 0) + 1;
  var attemptAt = nowIso_();
  updateRecord_('_Email_Queue', row._row, {
    status: 'ATTEMPTING', attempts: attempts, lastAttemptAt: attemptAt, errorCode: ''
  });
  try {
    var payload = JSON.parse(row.payloadJson || '{}');
    var rendered = renderEmail_(row.template, payload);
    MailApp.sendEmail({
      to: row.recipient,
      subject: row.subject,
      body: rendered.text,
      htmlBody: rendered.html,
      name: 'SK Tech',
      replyTo: setting_('SUPPORT_EMAIL') || undefined
    });
    updateRecord_('_Email_Queue', row._row, {
      status: 'SENT', sentAt: nowIso_(), nextAttemptAt: '', errorCode: ''
    });
    appendEmailLogUnlocked_(row, 'SENT', 'MailApp accepted the message.', '');
  } catch (error) {
    var max = Number(setting_('EMAIL_MAX_ATTEMPTS')) || 5;
    var retry = attempts < max;
    var delays = [5, 15, 60, 240, 720];
    var next = new Date(Date.now() + delays[Math.min(attempts - 1, delays.length - 1)] * 60000).toISOString();
    updateRecord_('_Email_Queue', row._row, {
      status: retry ? 'PENDING' : 'FAILED',
      nextAttemptAt: retry ? next : '',
      errorCode: 'MAIL_SEND_FAILED'
    });
    appendEmailLogUnlocked_(row, retry ? 'RETRY_SCHEDULED' : 'FAILED', String(error && error.name || 'Error'), 'MAIL_SEND_FAILED');
  }
  refreshOperationEmailStatusUnlocked_(row.operationToken);
}

function appendEmailLogUnlocked_(row, status, providerMessage, errorCode) {
  appendRecord_('_Email_Log', {
    eventAt: nowIso_(), emailId: row.emailId, template: row.template,
    recipientHash: hash_(row.recipient), status: status,
    providerMessage: String(providerMessage || '').slice(0, 240),
    errorCode: errorCode || '', requestId: row.requestId || ''
  });
}

function refreshOperationEmailStatusUnlocked_(operationToken) {
  if (!operationToken) return;
  var messages = records_('_Email_Queue').filter(function (row) { return row.operationToken === operationToken; });
  if (!messages.length) return;
  var statuses = messages.map(function (row) { return row.status; });
  var status = 'QUEUED';
  if (statuses.every(function (value) { return value === 'SENT'; })) status = 'SENT';
  else if (statuses.some(function (value) { return value === 'FAILED'; })) status = 'FAILED';
  else if (statuses.some(function (value) { return value === 'UNKNOWN'; })) status = 'UNKNOWN';
  else if (statuses.some(function (value) { return value === 'SUPPRESSED'; })) {
    status = statuses.some(function (value) { return value === 'SENT'; }) ? 'PARTIAL' : 'SUPPRESSED';
  }
  setOperationEmailStatus_(operationToken, status, status === 'FAILED' ? 'MAIL_SEND_FAILED' : '');
}

function renderEmail_(template, payload) {
  var p = payload || {};
  var lines = [];
  var title = 'SK Tech update';
  if (template === 'OTP') {
    title = 'Verify your email';
    lines = [
      'Your verification code is ' + p.code + '.',
      'It expires in ' + p.expiresMinutes + ' minutes.',
      'If you did not request this code, you can ignore this email.'
    ];
  } else if (template === 'REGISTRATION') {
    title = 'Registration confirmed';
    lines = [
      'Hello ' + p.fullName + ',',
      'Your SK Tech registration is complete.',
      'Your SK ID: ' + p.candidateId,
      'Education: ' + p.education,
      'Experience: ' + p.experienceLevel,
      'Keep your SK ID safe; you will need it when booking an interview.'
    ];
  } else {
    var isReschedule = template.indexOf('RESCHEDULE') !== -1;
    var isInternal = template.indexOf('INTERNAL_') === 0;
    title = isReschedule ? 'Interview rescheduled' : 'Interview booked';
    lines = [
      (isInternal ? 'Candidate: ' + p.fullName + ' (' + p.candidateId + ')' : 'Hello ' + p.fullName + ','),
      isReschedule ? 'The interview schedule has been updated.' : 'The interview booking is confirmed.',
      'Booking ID: ' + p.bookingId,
      'Batch: ' + p.batch,
      'Company: ' + p.company,
      'Round: ' + p.round,
      'Technology: ' + p.technology,
      'Date: ' + p.date,
      'Time: ' + p.startTime + '–' + p.endTime + ' (' + setting_('TIME_ZONE') + ')',
      'Panel: ' + p.panelLabel
    ];
    if (isReschedule && p.previousDate) {
      lines.push('Previous schedule: ' + p.previousDate + ', ' + p.previousStartTime + '–' + p.previousEndTime);
    }
    if (!isInternal) {
      if (p.publicReference) lines.push('Booking reference: ' + p.publicReference);
      if (p.manageToken) lines.push('Manage token: ' + p.manageToken);
      if (p.manageUrl) lines.push('Manage this booking: ' + p.manageUrl);
    }
  }
  lines.push('Support: ' + (p.supportEmail || setting_('SUPPORT_EMAIL')));
  var text = lines.join('\n\n');
  var htmlLines = lines.map(function (line) {
    var escaped = Core.escapeHtml(line);
    if (line.indexOf('Manage this booking: http') === 0) {
      var url = line.slice('Manage this booking: '.length);
      return '<p><a href="' + Core.escapeHtml(url) + '">Manage this booking</a></p>';
    }
    return '<p>' + escaped + '</p>';
  }).join('');
  return {
    text: text,
    html: '<div style="font-family:Arial,sans-serif;max-width:620px;color:#162033">' +
      '<h2 style="color:#f36f21">' + Core.escapeHtml(title) + '</h2>' + htmlLines +
      '<p style="font-size:12px;color:#657085">This is an automated SK Tech message.</p></div>'
  };
}
