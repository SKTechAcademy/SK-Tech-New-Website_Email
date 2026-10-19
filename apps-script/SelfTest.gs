function runBackendSelfTests() {
  var failures = [];
  function expect(name, condition) { if (!condition) failures.push(name); }
  expect('Saturday is weekend', Core.isWeekend('2026-10-24'));
  expect('Monday is not weekend', !Core.isWeekend('2026-10-26'));
  expect('Overlapping slots conflict', Core.rangesOverlap('09:00', '09:30', '09:15', '09:45'));
  expect('Adjacent slots do not conflict', !Core.rangesOverlap('09:00', '09:30', '09:30', '10:00'));
  expect('Dummy name rejected', Boolean(Core.validateName('shiva123')));
  expect('Short phone rejected', Boolean(Core.validatePhone('123456')));
  expect('Realistic name accepted', !Core.validateName('Shiva Kumar'));
  expect('Realistic phone accepted', !Core.validatePhone('9845012763'));
  expect('Formula text is escaped', Core.safeCell('=IMPORTDATA("x")').charAt(0) === "'");
  if (failures.length) throw new Error('Backend self-tests failed: ' + failures.join(', '));
  return { passed: 9, failed: 0 };
}
