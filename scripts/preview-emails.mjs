import fs from 'node:fs/promises';
import vm from 'node:vm';

const ctx = vm.createContext({ setting_: (key) => ({ ENVIRONMENT: 'STAGING', TIME_ZONE: 'Asia/Kolkata', SUPPORT_EMAIL: 'support@mysktech.com' })[key] || '' });
for (const file of ['Core.gs', 'EmailQueue.gs']) vm.runInContext(await fs.readFile(`apps-script/${file}`, 'utf8'), ctx);
const logo = `data:image/png;base64,${(await fs.readFile('public/sk-tech-logo.png')).toString('base64')}`;
const payload = { fullName: 'Shiva Kumar', candidateId: 'TEST-SK0001', education: 'B.tech', experienceLevel: 'Fresher', code: '684293', expiresMinutes: 10, bookingId: 'TEST-BK-000001', publicReference: 'BR-PREVIEW-ONLY', batch: '2', company: 'Interview Company', round: 'Round 1', technology: 'Java', date: '2026-10-26', startTime: '10:00', endTime: '10:30', panelLabel: 'Interview Panel 1', previousDate: '2026-10-23', previousStartTime: '11:00', previousEndTime: '11:30', manageUrl: 'http://127.0.0.1:4173/#interviews' };
await fs.mkdir('artifacts/email-previews', { recursive: true });
for (const template of ['OTP', 'REGISTRATION', 'BOOKING', 'RESCHEDULE']) {
  const rendered = ctx.renderEmail_(template, payload);
  const html = rendered.html.replace('<!--SK_LOGO-->', `<img src="${logo}" alt="SK Tech logo" width="68" height="68" style="display:block;margin-bottom:14px">`);
  await fs.writeFile(`artifacts/email-previews/${template.toLowerCase()}.html`, html);
}
console.log('Four branded email previews generated in artifacts/email-previews. Preview data only; no emails sent.');
