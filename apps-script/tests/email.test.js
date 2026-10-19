const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function context() {
  const ctx = vm.createContext({ setting_: (key) => ({ ENVIRONMENT: 'STAGING', TIME_ZONE: 'Asia/Kolkata', SUPPORT_EMAIL: 'support@mysktech.com' })[key] || '' });
  for (const file of ['Core.gs', 'EmailQueue.gs']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx);
  return ctx;
}

test('registration and OTP emails highlight the correct ID and expiring code', () => {
  const ctx = context();
  const registration = ctx.renderEmail_('REGISTRATION', { fullName: '<script>alert(1)</script>', candidateId: 'TEST-SK0001', education: 'B.tech', experienceLevel: 'Fresher' });
  assert.match(registration.html, /YOUR SK TECH ID/);
  assert.match(registration.html, /TEST-SK0001/);
  assert.doesNotMatch(registration.html, /<script>/);
  assert.match(registration.html, /STAGING TEST/);
  const otp = ctx.renderEmail_('OTP', { code: '684293', expiresMinutes: 10 });
  assert.match(otp.html, /VERIFICATION CODE/);
  assert.match(otp.text, /10 minutes/);
});

test('booking and reschedule emails preserve details and protect management capability', () => {
  const ctx = context();
  const payload = { fullName: 'Shiva Kumar', bookingId: 'TEST-BK-000001', publicReference: 'BR-123', manageToken: 'BM-private', manageUrl: 'https://staging.example/#manage=BR-123:BM-private', date: '2026-10-26', startTime: '10:00', endTime: '10:30', previousDate: '2026-10-23', previousStartTime: '11:00', previousEndTime: '11:30' };
  for (const template of ['BOOKING', 'RESCHEDULE']) {
    const email = ctx.renderEmail_(template, payload);
    assert.match(email.html, /Manage or reschedule interview/);
    assert.match(email.text, /BR-123/);
    assert.doesNotMatch(email.html, /Manage token:/);
    assert.match(email.html, /10:00/);
  }
  assert.match(ctx.renderEmail_('RESCHEDULE', payload).html, /Previous schedule/);
  assert.doesNotMatch(ctx.renderEmail_('INTERNAL_BOOKING', payload).html, /BM-private/);
  assert.doesNotMatch(ctx.renderEmail_('BOOKING', { ...payload, manageUrl: 'javascript:alert(1)' }).html, /href="javascript:/);
});
