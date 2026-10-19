const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('anonymous execute-as-owner requests cannot inherit administrator identity', () => {
  const ctx = vm.createContext({
    SpreadsheetApp: {getActiveSpreadsheet:()=>null},
    getSpreadsheet_:()=>({getId:()=> 'staging'}),
    Core: {normalizeEmail:v=>String(v||'').toLowerCase()},
    Session: {getActiveUser:()=>({getEmail:()=>''}),getEffectiveUser:()=>({getEmail:()=> 'support@mysktech.com'})},
    setting_:key=>key==='ADMIN_ALLOWLIST'?'support@mysktech.com':'',
    appError_:(code,message)=>Object.assign(new Error(message),{code}),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../Admin.gs'),'utf8'),ctx);
  assert.throws(()=>ctx.assertAdmin_(),e=>e.code==='ADMIN_FORBIDDEN');
});
