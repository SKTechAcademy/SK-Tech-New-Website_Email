var SK_UPLOAD_TTL_MINUTES = 30;
var SK_UPLOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;
var SK_UPLOAD_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

function getUploadWidget_(params) {
  var origin = normalizeOrigin_(params.origin);
  var nonce = String(params.nonce || '');
  var allowed = String(setting_('ALLOWED_WEB_ORIGINS') || '').split(',').map(normalizeOrigin_).filter(Boolean);
  if (!origin || allowed.indexOf(origin) === -1 || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>Document upload is not authorized for this website.</p>')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  var template = HtmlService.createTemplateFromFile('UploadWidget');
  template.parentOriginJson = JSON.stringify(origin);
  template.nonceJson = JSON.stringify(nonce);
  template.maxFileBytes = SK_UPLOAD_MAX_FILE_BYTES;
  template.maxTotalBytes = SK_UPLOAD_MAX_TOTAL_BYTES;
  return template.evaluate()
    .setTitle('SK Tech secure document upload')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function uploadCandidateFiles(formObject) {
  var form = formObject || {};
  var origin = normalizeOrigin_(form.replyOrigin);
  var allowed = String(setting_('ALLOWED_WEB_ORIGINS') || '').split(',').map(normalizeOrigin_).filter(Boolean);
  var nonce = String(form.nonce || '');
  if (!origin || allowed.indexOf(origin) === -1 || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce)) {
    throw appError_('UPLOAD_ORIGIN_DENIED', 'Document upload is not authorized for this website.');
  }
  var email = Core.normalizeEmail(form.email);
  if (Core.validateEmail(email)) throw appError_('VALIDATION_FAILED', 'Enter a valid email address.');
  assertStagingRecipientAllowed_(email);
  assertRegistrationVerificationToken_(String(form.verificationToken || ''), email);
  var requestId = assertRequestId_(form.requestId);
  checkRateLimit_('candidate-upload', email, 5, 3600);
  checkRateLimit_('candidate-upload-global', 'all', 20, 3600);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw appError_('BUSY', 'The upload service is busy. Please try again.');
  try {
    var existing = findRecord_('_Upload_Sessions', 'requestId', requestId);
    if (existing) {
      if (existing.emailHash !== hash_(email) || existing.status !== 'READY' || new Date(existing.expiresAt).getTime() < Date.now()) {
        throw appError_('UPLOAD_SESSION_UNAVAILABLE', 'Select the documents again and retry.');
      }
      return uploadResultFromRecord_(existing, email);
    }

    var folderRootId = PropertiesService.getScriptProperties().getProperty('UPLOADS_FOLDER_ID');
    if (!folderRootId) throw appError_('UPLOADS_NOT_CONFIGURED', 'Document upload is not configured yet.');
    var uploadId = 'UPL-' + randomToken_().slice(0, 24);
    var root = DriveApp.getFolderById(folderRootId);
    var folder = root.createFolder(uploadId);
    var saved = { resume: '', aadhar: '', offers: [], relieving: '', experience: '' };
    var totalBytes = 0;

    function saveOne(fieldName, kind) {
      var blob = form[fieldName];
      if (!blob || typeof blob.getBytes !== 'function') return '';
      var bytes = blob.getBytes();
      if (!bytes.length) return '';
      totalBytes += bytes.length;
      if (bytes.length > SK_UPLOAD_MAX_FILE_BYTES || totalBytes > SK_UPLOAD_MAX_TOTAL_BYTES) {
        throw appError_('UPLOAD_TOO_LARGE', 'Each document must be 10 MB or smaller and the total must be 30 MB or smaller.');
      }
      var safe = validateUploadBlob_(blob, bytes);
      var file = folder.createFile(blob).setName(uploadId + '-' + kind + safe.extension);
      return file.getId();
    }

    try {
      saved.resume = saveOne('resume', 'resume');
      saved.aadhar = saveOne('aadhar', 'aadhar');
      for (var i = 1; i <= 5; i += 1) {
        var offerId = saveOne('offerLetter' + i, 'offer-' + i);
        if (offerId) saved.offers.push(offerId);
      }
      saved.relieving = saveOne('relievingLetter', 'relieving');
      saved.experience = saveOne('experienceLetter', 'experience');
      if (!saved.resume && !saved.aadhar && !saved.offers.length && !saved.relieving && !saved.experience) {
        folder.setTrashed(true);
        throw appError_('NO_DOCUMENTS', 'Choose at least one document before uploading.');
      }
    } catch (error) {
      try { folder.setTrashed(true); } catch (ignore) {}
      throw error;
    }

    var expiresAt = new Date(Date.now() + SK_UPLOAD_TTL_MINUTES * 60000).toISOString();
    var token = buildUploadToken_(uploadId, email, requestId);
    var rowNumber = appendRecord_('_Upload_Sessions', {
      createdAt: nowIso_(), uploadId: uploadId, emailHash: hash_(email), tokenHash: hash_(token),
      status: 'READY', expiresAt: expiresAt, folderId: folder.getId(),
      resumeFileId: saved.resume, aadharFileId: saved.aadhar,
      offerLetterFileIds: JSON.stringify(saved.offers), relievingLetterFileId: saved.relieving,
      experienceLetterFileId: saved.experience, consumedAt: '', requestId: requestId
    });
    auditUnlocked_('CANDIDATE_DOCUMENTS_UPLOADED', 'PUBLIC', 'UPLOAD', uploadId, requestId, 'SUCCESS', {
      fileCount: [saved.resume, saved.aadhar, saved.relieving, saved.experience].filter(Boolean).length + saved.offers.length
    });
    var record = findRecord_('_Upload_Sessions', 'uploadId', uploadId);
    if (!record) record = { _row: rowNumber, uploadId: uploadId, expiresAt: expiresAt, requestId: requestId,
      resumeFileId: saved.resume, aadharFileId: saved.aadhar, offerLetterFileIds: JSON.stringify(saved.offers),
      relievingLetterFileId: saved.relieving, experienceLetterFileId: saved.experience };
    return uploadResultFromRecord_(record, email);
  } finally {
    lock.releaseLock();
  }
}

function assertRegistrationVerificationToken_(token, email) {
  if (!emailVerificationRequired_()) return;
  if (!/^VT-[A-Za-z0-9]{50,80}$/.test(token)) {
    throw appError_('EMAIL_VERIFICATION_REQUIRED', 'Verify your email before uploading documents.');
  }
  var challenge = findRecord_('_Otp_Challenges', 'tokenHash', hash_(token));
  if (!challenge || challenge.status !== 'VERIFIED' || challenge.purpose !== 'REGISTRATION' ||
      challenge.emailHash !== hash_(email) || new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw appError_('EMAIL_VERIFICATION_REQUIRED', 'Verify your email again before uploading documents.');
  }
}

function validateUploadBlob_(blob, bytes) {
  var name = String(blob.getName ? blob.getName() : '').replace(/[\\/\u0000-\u001f]/g, '').trim();
  var match = name.toLowerCase().match(/(\.pdf|\.doc|\.docx|\.jpg|\.jpeg|\.png)$/);
  if (!match) throw appError_('UPLOAD_TYPE_NOT_ALLOWED', 'Documents must be PDF, DOC, DOCX, JPG or PNG files.');
  var extension = match[1] === '.jpeg' ? '.jpg' : match[1];
  var type = String(blob.getContentType ? blob.getContentType() : '').toLowerCase();
  var allowedTypesByExtension = {
    '.pdf': { 'application/pdf': true, 'application/octet-stream': true },
    '.doc': { 'application/msword': true, 'application/octet-stream': true },
    '.docx': { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true, 'application/zip': true, 'application/octet-stream': true },
    '.jpg': { 'image/jpeg': true, 'image/jpg': true, 'application/octet-stream': true },
    '.png': { 'image/png': true, 'application/octet-stream': true }
  };
  if (type && !allowedTypesByExtension[extension][type]) {
    throw appError_('UPLOAD_TYPE_NOT_ALLOWED', 'The file extension and document type do not match.');
  }
  var signature = (bytes || []).slice(0, 8).map(function (value) { return Number(value) & 255; });
  var matches = extension === '.pdf' ? signature.slice(0, 5).join(',') === '37,80,68,70,45' :
    extension === '.jpg' ? signature.slice(0, 3).join(',') === '255,216,255' :
    extension === '.png' ? signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' :
    extension === '.doc' ? signature.slice(0, 8).join(',') === '208,207,17,224,161,177,26,225' :
    signature.slice(0, 4).join(',') === '80,75,3,4' || signature.slice(0, 4).join(',') === '80,75,5,6' || signature.slice(0, 4).join(',') === '80,75,7,8';
  if (!matches) throw appError_('UPLOAD_TYPE_NOT_ALLOWED', 'The file contents do not match the selected document type.');
  return { extension: extension };
}

function buildUploadToken_(uploadId, email, requestId) {
  return 'UT-' + hash_(uploadId + '|' + email + '|' + requestId).slice(0, 48);
}

function uploadResultFromRecord_(record, email) {
  var offers = [];
  try { offers = JSON.parse(record.offerLetterFileIds || '[]'); } catch (ignore) {}
  return {
    uploadToken: buildUploadToken_(record.uploadId, email, record.requestId),
    expiresInSeconds: Math.max(0, Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / 1000)),
    fileCount: [record.resumeFileId, record.aadharFileId, record.relievingLetterFileId, record.experienceLetterFileId]
      .filter(Boolean).length + offers.length
  };
}

function consumeUploadSessionUnlocked_(token, email) {
  var empty = {
    resumeFileUrl: '', aadharFileUrl: '', offerLetterFileUrls: '',
    relievingLetterFileUrl: '', experienceLetterFileUrl: ''
  };
  var value = String(token || '');
  if (!value) return empty;
  if (!/^UT-[A-Za-z0-9_-]{40,60}$/.test(value)) throw appError_('UPLOAD_SESSION_INVALID', 'Upload the documents again.');
  var session = findRecord_('_Upload_Sessions', 'tokenHash', hash_(value));
  if (!session || session.status !== 'READY' || session.emailHash !== hash_(Core.normalizeEmail(email)) ||
      new Date(session.expiresAt).getTime() < Date.now()) {
    throw appError_('UPLOAD_SESSION_INVALID', 'The document upload expired. Upload the documents again.');
  }
  function urlFor(id) {
    if (!id) return '';
    return DriveApp.getFileById(id).getUrl();
  }
  var offerIds = [];
  try { offerIds = JSON.parse(session.offerLetterFileIds || '[]'); } catch (ignore) {}
  updateRecord_('_Upload_Sessions', session._row, { status: 'CONSUMED', consumedAt: nowIso_() });
  return {
    resumeFileUrl: urlFor(session.resumeFileId),
    aadharFileUrl: urlFor(session.aadharFileId),
    offerLetterFileUrls: offerIds.map(urlFor).join('\n'),
    relievingLetterFileUrl: urlFor(session.relievingLetterFileId),
    experienceLetterFileUrl: urlFor(session.experienceLetterFileId)
  };
}
