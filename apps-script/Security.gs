function assertHumanRequest_(payload) {
  var body = payload || {};
  if (Core.cleanText(body.hp || body.website || body.middleName)) {
    throw appError_('REQUEST_REJECTED', 'The request could not be accepted.');
  }
  if (!settingBoolean_('TURNSTILE_ENABLED')) return;
  var token = String(body.turnstileToken || '');
  var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
  if (!token || !secret) throw appError_('BOT_CHECK_REQUIRED', 'Please complete the security check.');
  var response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: { secret: secret, response: token },
    muteHttpExceptions: true
  });
  var result;
  try { result = JSON.parse(response.getContentText()); } catch (ignore) { result = {}; }
  if (!result.success) throw appError_('BOT_CHECK_FAILED', 'The security check expired. Please try again.');
}

function requestEmailVerification_(payload) {
  assertHumanRequest_(payload);
  var email = Core.normalizeEmail(payload.email);
  var emailError = Core.validateEmail(email);
  if (emailError) throw appError_('VALIDATION_FAILED', 'Enter a valid email address.', { email: emailError });
  var purpose = String(payload.purpose || '').toUpperCase();
  if (['REGISTRATION', 'BOOKING'].indexOf(purpose) === -1) {
    throw appError_('VALIDATION_FAILED', 'Select a valid verification purpose.');
  }
  return withIdempotency_(payload.requestId, 'requestEmailVerification', payload, function () {
    assertStagingRecipientAllowed_(email);
    checkRateLimit_('otp-email', email, 3, 3600);
    checkRateLimit_('otp-global', Utilities.formatDate(new Date(), 'GMT', 'yyyyMMddHH'), 100, 3600);
    var verificationId = 'VRF-' + randomToken_().slice(0, 24);
    var code = randomDigits_(6);
    var ttl = Number(setting_('OTP_TTL_MINUTES')) || 10;
    var expires = new Date(Date.now() + ttl * 60000).toISOString();
    appendRecord_('_Otp_Challenges', {
      createdAt: nowIso_(), verificationId: verificationId, emailHash: hash_(email),
      otpHash: hash_(verificationId + '|' + email + '|' + code), purpose: purpose,
      expiresAt: expires, attempts: 0,
      maxAttempts: Number(setting_('OTP_MAX_ATTEMPTS')) || 5,
      status: 'PENDING', verifiedAt: '', consumedAt: '', tokenHash: '',
      requestId: payload.requestId
    });
    queueEmailUnlocked_('OTP', email, 'Your SK Tech verification code', {
      code: code, purpose: purpose, expiresMinutes: ttl
    }, payload.requestId, '');
    auditUnlocked_('OTP_REQUESTED', 'PUBLIC', 'OTP', verificationId, payload.requestId, 'SUCCESS', { purpose: purpose });
    return {
      code: 'VERIFICATION_SENT',
      verificationId: verificationId,
      expiresInSeconds: ttl * 60,
      emailQueued: true,
      _resourceId: verificationId
    };
  });
}

function isStagingRecipientAllowed_(email) {
  if (String(setting_('ENVIRONMENT')).toUpperCase() !== 'STAGING') return true;
  var normalized = Core.normalizeEmail(email);
  var exact = String(setting_('STAGING_EMAIL_ALLOWLIST') || '').split(',').map(Core.normalizeEmail).filter(Boolean);
  if (exact.indexOf(normalized) !== -1) return true;
  var domain = normalized.split('@')[1] || '';
  var domains = String(setting_('STAGING_EMAIL_ALLOWED_DOMAINS') || '').split(',').map(function (value) {
    return String(value || '').trim().toLowerCase().replace(/^@/, '');
  }).filter(Boolean);
  return domains.indexOf(domain) !== -1;
}

function assertStagingRecipientAllowed_(email) {
  if (!isStagingRecipientAllowed_(email)) {
    throw appError_('EMAIL_NOT_ALLOWED_IN_STAGING', 'Use an approved staging test email address.');
  }
}

function verifyEmail_(payload) {
  var email = Core.normalizeEmail(payload.email);
  if (Core.validateEmail(email)) throw appError_('VERIFICATION_FAILED', 'The code or email is invalid.');
  var verificationId = String(payload.verificationId || '');
  var code = String(payload.code || '').replace(/\s/g, '');
  if (!/^VRF-[A-Za-z0-9]{20,30}$/.test(verificationId) || !/^\d{6}$/.test(code)) {
    throw appError_('VERIFICATION_FAILED', 'The code or email is invalid.');
  }
  return withIdempotency_(payload.requestId, 'verifyEmail', payload, function () {
    checkRateLimit_('otp-attempt', verificationId, 8, 900);
    var challenge = findRecord_('_Otp_Challenges', 'verificationId', verificationId);
    if (!challenge || challenge.emailHash !== hash_(email)) {
      throw appError_('VERIFICATION_FAILED', 'The code or email is invalid.');
    }
    if (challenge.status !== 'PENDING') throw appError_('VERIFICATION_UNAVAILABLE', 'Request a new verification code.');
    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      updateRecord_('_Otp_Challenges', challenge._row, { status: 'EXPIRED' });
      throw appError_('VERIFICATION_EXPIRED', 'The verification code expired. Request a new code.');
    }
    var attempts = Number(challenge.attempts || 0) + 1;
    if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || 5)) {
      updateRecord_('_Otp_Challenges', challenge._row, { attempts: attempts, status: 'LOCKED' });
      throw appError_('VERIFICATION_LOCKED', 'Too many attempts. Request a new code.');
    }
    if (challenge.otpHash !== hash_(verificationId + '|' + email + '|' + code)) {
      updateRecord_('_Otp_Challenges', challenge._row, {
        attempts: attempts,
        status: attempts >= Number(challenge.maxAttempts || 5) ? 'LOCKED' : 'PENDING'
      });
      if (attempts >= Number(challenge.maxAttempts || 5)) {
        throw appError_('VERIFICATION_LOCKED', 'Too many attempts. Request a new code.');
      }
      throw appError_('VERIFICATION_FAILED', 'The code or email is invalid.');
    }
    var token = 'VT-' + randomToken_();
    updateRecord_('_Otp_Challenges', challenge._row, {
      attempts: attempts, status: 'VERIFIED', verifiedAt: nowIso_(), tokenHash: hash_(token)
    });
    auditUnlocked_('EMAIL_VERIFIED', 'PUBLIC', 'OTP', verificationId, payload.requestId, 'SUCCESS', { purpose: challenge.purpose });
    return {
      code: 'EMAIL_VERIFIED',
      verificationToken: token,
      expiresInSeconds: Math.max(0, Math.floor((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)),
      _resourceId: verificationId
    };
  });
}

function consumeEmailVerificationUnlocked_(token, email, purpose) {
  var raw = String(token || '');
  if (!/^VT-[A-Za-z0-9]{50,80}$/.test(raw)) {
    throw appError_('EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before continuing.');
  }
  var challenge = findRecord_('_Otp_Challenges', 'tokenHash', hash_(raw));
  if (!challenge || challenge.status !== 'VERIFIED' || challenge.purpose !== purpose || challenge.emailHash !== hash_(Core.normalizeEmail(email))) {
    throw appError_('EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before continuing.');
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    updateRecord_('_Otp_Challenges', challenge._row, { status: 'EXPIRED' });
    throw appError_('VERIFICATION_EXPIRED', 'Email verification expired. Verify again.');
  }
  updateRecord_('_Otp_Challenges', challenge._row, { status: 'CONSUMED', consumedAt: nowIso_() });
  return challenge;
}
