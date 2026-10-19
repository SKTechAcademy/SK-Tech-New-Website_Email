// Explicit live acceptance checks. Writes ONLY to the designated staging API.
// Run manually with the owner's approval; never include in automated CI.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const endpoint = 'https://script.google.com/macros/s/AKfycby41G1mTctWrv-p7_PwWsyMHhA3xz2teo8VkBszsHpuUsJEmTvMMDOVL4nl_Mf2NK2rhA/exec';
const statePath = '.tmp/live-acceptance-state.json';
const mode = process.argv[2];
let state = {};
try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); } catch {}
async function post(action, body, requestId = 'acceptance-' + randomUUID()) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, requestId, ...body }), signal: AbortSignal.timeout(90000) });
  return response.json();
}
const email = 'siva92396@gmail.com';
if (mode === 'request') {
  const r = await post('requestEmailVerification', { email, purpose: 'BOOKING' });
  assert.equal(r.ok, true, r.message);
  state.verificationId = r.data.verificationId;
  console.log('Booking OTP queued through the real staging API.');
} else if (mode === 'verify') {
  const r = await post('verifyEmail', { email, verificationId: state.verificationId, code: process.env.STAGING_TEST_OTP });
  assert.equal(r.ok, true, r.message);
  state.verificationToken = r.data.verificationToken;
  console.log('Real booking verification completed.');
} else if (mode === 'exercise') {
  const booking = { skId: 'SK1', email, fullName: 'Siva Kumar', batch: '1', panelId: 'PANEL-TEST-01', date: '2026-10-20', startTime: '10:00', endTime: '10:30', round: 'Round 2', technology: 'Java', company: 'SK Tech Staging', hrName: 'Siva Kumar', hrPhone: '9353447457', hrEmail: email };
  for (const [name, change, expected] of [
    ['dummy-name', {fullName:'shiva123'}, 'VALIDATION_FAILED'],
    ['dummy-phone', {hrPhone:'123456'}, 'VALIDATION_FAILED'],
    ['weekend', {date:'2026-10-24'}, 'SLOT_UNAVAILABLE'],
    ['occupied-slot', {}, 'SLOT_UNAVAILABLE'],
  ]) {
    const r = await post('bookInterview', { booking: {...booking, ...change}, verificationToken: state.verificationToken });
    assert.equal(r.ok, false, name);
    assert.equal(r.code, expected, name + ': ' + r.message);
    console.log(name + ': rejected as expected (' + r.code + ')');
  }
  const body = {booking: {...booking, startTime:'11:00', endTime:'11:30'}, verificationToken:state.verificationToken};
  const requestId = 'acceptance-same-day-' + randomUUID();
  const first = await post('bookInterview', body, requestId);
  assert.equal(first.ok, true, first.message);
  const replay = await post('bookInterview', body, requestId);
  assert.equal(replay.ok, true, replay.message);
  assert.equal(replay.data.operationToken, first.data.operationToken);
  state.secondBooking = {requestId, code:first.code};
  console.log('Same candidate second interview saved; exact request replay returned the same operation.');
} else throw new Error('Use request, verify or exercise.');
await fs.mkdir('.tmp', {recursive:true});
await fs.writeFile(statePath, JSON.stringify(state));
