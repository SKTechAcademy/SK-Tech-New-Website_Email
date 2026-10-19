var SK_SCHEMA = {
  Settings: ['key', 'value', 'valueType', 'description', 'editable'],
  Candidates: [
    'createdAt', 'candidateId', 'fullName', 'email', 'emailNormalized', 'emailId',
    'emailIdNormalized', 'mobileNumber', 'whatsappNumber', 'gender', 'education',
    'passoutYear', 'collegeName', 'experienceLevel', 'currentAddress', 'currentCompany',
    'currentCtc', 'expectedCtc', 'noticePeriod', 'resumeFileUrl', 'aadharFileUrl',
    'offerLetterFileUrls', 'relievingLetterFileUrl', 'experienceLetterFileUrl', 'source',
    'status', 'verificationId', 'requestId', 'consentVersion', 'createdBy'
  ],
  Interview_Bookings: [
    'createdAt', 'bookingId', 'publicReference', 'candidateId', 'candidateEmail',
    'candidateName', 'batch', 'panelId', 'panelLabel', 'date', 'startTime', 'endTime',
    'timezone', 'round', 'technology', 'company', 'hrName', 'hrPhone', 'hrEmail',
    'status', 'previousBookingId', 'rootBookingId', 'manageTokenHash', 'requestId',
    'version', 'updatedAt'
  ],
  Booking_History: [
    'eventAt', 'eventId', 'bookingId', 'rootBookingId', 'eventType', 'statusFrom',
    'statusTo', 'actor', 'requestId', 'beforeJson', 'afterJson', 'reason'
  ],
  Panels: [
    'panelId', 'publicLabel', 'internalName', 'active', 'weekdays', 'startTime',
    'endTime', 'slotMinutes', 'capacity', 'effectiveFrom', 'effectiveTo'
  ],
  Slot_Blocks: [
    'createdAt', 'blockId', 'scope', 'panelId', 'dateFrom', 'dateTo', 'startTime',
    'endTime', 'reason', 'active', 'createdBy'
  ],
  Special_Open_Dates: [
    'createdAt', 'overrideId', 'panelId', 'dateFrom', 'dateTo', 'startTime',
    'endTime', 'reason', 'active', 'createdBy'
  ],
  Jobs: [
    'createdAt', 'jobId', 'company', 'title', 'experience', 'location', 'skills',
    'employmentType', 'salary', 'description', 'applyUrl', 'status', 'postedDate',
    'updatedAt'
  ],
  Reference_Data: ['type', 'value', 'label', 'active', 'sortOrder'],
  _Sequences: ['name', 'nextValue', 'prefix', 'padLength'],
  _Email_Queue: [
    'createdAt', 'emailId', 'template', 'recipient', 'subject', 'payloadJson',
    'status', 'attempts', 'nextAttemptAt', 'lastAttemptAt', 'errorCode', 'requestId',
    'operationToken', 'sentAt'
  ],
  _Email_Log: [
    'eventAt', 'emailId', 'template', 'recipientHash', 'status', 'providerMessage',
    'errorCode', 'requestId'
  ],
  _Otp_Challenges: [
    'createdAt', 'verificationId', 'emailHash', 'otpHash', 'purpose', 'expiresAt',
    'attempts', 'maxAttempts', 'status', 'verifiedAt', 'consumedAt', 'tokenHash',
    'requestId'
  ],
  _Request_Log: [
    'createdAt', 'requestId', 'action', 'fingerprint', 'status', 'operationToken',
    'resultCode', 'resourceId', 'safeResultJson', 'emailStatus', 'updatedAt', 'errorCode'
  ],
  _Audit_Log: [
    'eventAt', 'eventId', 'action', 'actor', 'resourceType', 'resourceId',
    'requestId', 'outcome', 'metadataJson'
  ],
  _Upload_Sessions: [
    'createdAt', 'uploadId', 'emailHash', 'tokenHash', 'status', 'expiresAt',
    'folderId', 'resumeFileId', 'aadharFileId', 'offerLetterFileIds',
    'relievingLetterFileId', 'experienceLetterFileId', 'consumedAt', 'requestId'
  ]
};

var SK_PRIVATE_SHEETS = {
  _Sequences: true,
  _Email_Queue: true,
  _Email_Log: true,
  _Otp_Challenges: true,
  _Request_Log: true,
  _Audit_Log: true,
  _Upload_Sessions: true
};
