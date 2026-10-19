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
  // MailApp sends as the executing account. replyTo alone cannot set From.
  if (String(Session.getEffectiveUser().getEmail()).toLowerCase() !== 'support@mysktech.com') {
    throw appError_('SENDER_ACCOUNT_MISMATCH', 'Deploy and install the mail trigger as support@mysktech.com.');
  }
  var attempts = Number(row.attempts || 0) + 1;
  var attemptAt = nowIso_();
  updateRecord_('_Email_Queue', row._row, {
    status: 'ATTEMPTING', attempts: attempts, lastAttemptAt: attemptAt, errorCode: ''
  });
  try {
    var payload = JSON.parse(row.payloadJson || '{}');
    var rendered = renderEmail_(row.template, payload);
    var logo = getEmailLogo_();
    var message = {
      to: row.recipient,
      subject: row.subject,
      body: rendered.text,
      htmlBody: logo ? rendered.html.replace('<!--SK_LOGO-->', '<img src="cid:skTechLogo" alt="SK Tech logo" width="68" height="68" style="display:block;margin-bottom:14px">') : rendered.html,
      name: 'SK Tech',
      replyTo: setting_('SUPPORT_EMAIL') || undefined
    };
    if (logo) message.inlineImages = { skTechLogo: logo };
    MailApp.sendEmail(message);
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

function getEmailLogo_() {
  var folderId = PropertiesService.getScriptProperties().getProperty('UPLOADS_FOLDER_ID');
  if (!folderId) return null;
  var files = DriveApp.getFolderById(folderId).getFilesByName('sk-tech-email-logo.png');
  return files.hasNext() ? files.next().getBlob() : null;
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
      if (!/^https?:\/\//i.test(url)) return '';
      return '<p style="margin:24px 0"><a style="display:inline-block;background:#f58220;color:#ffffff;padding:15px 24px;border-radius:10px;font-weight:bold;text-decoration:none" href="' + Core.escapeHtml(url) + '">Manage or reschedule interview &rarr;</a></p>';
    }
    if (line.indexOf('Manage token: ') === 0) return '';
    if (line.indexOf('Your SK ID: ') === 0) return '<div style="background:#eef6ff;border:1px solid #c8e1ff;border-radius:14px;padding:20px;margin:22px 0"><div style="font-size:12px;color:#536a89;letter-spacing:2px">YOUR SK TECH ID</div><div style="font-size:32px;font-weight:bold;color:#123d75;margin-top:8px">' + Core.escapeHtml(p.candidateId) + '</div></div>';
    if (template === 'OTP' && line.indexOf('Your verification code') === 0) return '<div style="background:#eef6ff;border:1px solid #c8e1ff;border-radius:14px;text-align:center;padding:24px;margin:22px 0"><div style="font-size:12px;letter-spacing:2px;color:#536a89">VERIFICATION CODE</div><div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#123d75;margin-top:12px">' + Core.escapeHtml(p.code) + '</div></div>';
    return '<p style="margin:0 0 14px;line-height:1.7;color:#40536d">' + escaped + '</p>';
  }).join('');
  return {
    text: text,
    html: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#edf2f8;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="display:none;max-height:0;overflow:hidden">' + Core.escapeHtml(title) + ' · SK Tech Academy</div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf2f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden">' +
      '<tr><td style="background:#102a4f;padding:28px 32px;border-bottom:5px solid #f58220"><!--SK_LOGO--><div style="font-size:28px;font-weight:bold;color:#ffffff">SK <span style="color:#ff962e">TECH</span></div><div style="font-size:12px;letter-spacing:2px;color:#c6daf5;margin-top:8px">YOUR FUTURE, OUR MISSION</div></td></tr>' +
      '<tr><td style="padding:30px 28px"><div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#168a79;margin-bottom:12px">' + (setting_('ENVIRONMENT') === 'STAGING' ? 'STAGING TEST · ' : '') + 'SK TECH ACADEMY</div><h1 style="font-size:27px;line-height:1.25;color:#102a4f;margin:0 0 24px">' + Core.escapeHtml(title) + '</h1>' + htmlLines + '</td></tr>' +
      '<tr><td style="padding:22px 28px;background:#f6f9fd;border-top:1px solid #e3eaf4"><div style="font-size:12px;line-height:1.7;color:#6e7f96">Learn. Practice. Grow. Get Placed.<br>This is an automated SK Tech message. Keep your verification code and booking link private.</div></td></tr></table></td></tr></table></body></html>'
  };
}
