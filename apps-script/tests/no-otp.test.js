const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('no-OTP forms retain recipient restrictions and spam limits without marking email verified', () => {
  const calls = [];
  const ctx = vm.createContext({
    Core: {normalizeEmail: value => value.toLowerCase()},
    assertStagingRecipientAllowed_: email => calls.push(['recipient',email]),
    checkRateLimit_: (...args) => calls.push(args),
    appError_: (code,message) => Object.assign(new Error(message),{code})
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../Security.gs'),'utf8'),ctx);
  ctx.assertStagingRecipientAllowed_ = email => calls.push(['recipient',email]);
  assert.equal(ctx.emailVerificationRequired_(),false);
  assert.equal(ctx.consumeEmailVerificationUnlocked_('', 'sample@example.com','REGISTRATION').verificationId,'');
  assert.equal(calls[1][0],'form-REGISTRATION');
  assert.equal(calls[2][0],'public-form-global');
  assert.throws(() => ctx.requestEmailVerification_({}), {code:'OTP_DISABLED'});
});
