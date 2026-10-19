function registerCandidate_(payload) {
  assertHumanRequest_(payload);
  return withIdempotency_(payload.requestId, 'registerCandidate', payload, function () {
    if (!settingBoolean_('REGISTRATION_EMAIL_ENABLED')) {
      throw appError_('EMAIL_DISABLED', 'Registration is temporarily unavailable.');
    }
    var candidate = assertCandidatePayload_(payload.candidate);
    var challenge = consumeEmailVerificationUnlocked_(payload.verificationToken, candidate.email, 'REGISTRATION');
    var documents = consumeUploadSessionUnlocked_(payload.uploadToken, candidate.email);
    var candidateId = allocateIdUnlocked_('candidate');
    appendRecord_('Candidates', {
      createdAt: nowIso_(),
      candidateId: candidateId,
      fullName: candidate.fullName,
      email: candidate.email,
      emailNormalized: candidate.email,
      emailId: candidate.emailId,
      emailIdNormalized: candidate.emailId,
      mobileNumber: candidate.mobileNumber,
      whatsappNumber: candidate.whatsappNumber,
      gender: candidate.gender,
      education: candidate.education,
      passoutYear: candidate.passoutYear,
      collegeName: candidate.collegeName,
      experienceLevel: candidate.experienceLevel,
      currentAddress: candidate.currentAddress,
      currentCompany: candidate.currentCompany,
      currentCtc: candidate.currentCtc,
      expectedCtc: candidate.expectedCtc,
      noticePeriod: candidate.noticePeriod,
      resumeFileUrl: documents.resumeFileUrl,
      aadharFileUrl: documents.aadharFileUrl,
      offerLetterFileUrls: documents.offerLetterFileUrls,
      relievingLetterFileUrl: documents.relievingLetterFileUrl,
      experienceLetterFileUrl: documents.experienceLetterFileUrl,
      source: candidate.source,
      status: 'REGISTERED',
      verificationId: challenge.verificationId,
      requestId: payload.requestId,
      consentVersion: setting_('CONSENT_VERSION'),
      createdBy: 'PUBLIC_WEBSITE'
    });
    var operationToken = createOperationUnlocked_('registerCandidate', candidateId);
    queueEmailUnlocked_('REGISTRATION', candidate.email, 'Your SK Tech registration is confirmed', {
      fullName: candidate.fullName,
      candidateId: candidateId,
      education: candidate.education,
      experienceLevel: candidate.experienceLevel,
      supportEmail: setting_('SUPPORT_EMAIL')
    }, payload.requestId, operationToken);
    auditUnlocked_('CANDIDATE_REGISTERED', 'PUBLIC', 'CANDIDATE', candidateId, payload.requestId, 'SUCCESS', {
      environment: setting_('ENVIRONMENT')
    });
    return {
      code: 'REGISTRATION_CONFIRMED',
      operationToken: operationToken,
      status: 'CONFIRMED',
      emailQueued: true,
      _resourceId: candidateId
    };
  });
}
