/**
 * Pure helpers shared by the Apps Script runtime and the local Node test suite.
 * Keep this file free of Apps Script globals at evaluation time.
 */
var Core = (function () {
  'use strict';

  var PLACEHOLDER_WORDS = {
    'asdf': true,
    'dummy': true,
    'fake': true,
    'na': true,
    'none': true,
    'null': true,
    'qwerty': true,
    'sample': true,
    'test': true,
    'testing': true,
    'unknown': true,
    'xxx': true
  };

  var DISPOSABLE_EMAIL_DOMAINS = {
    '10minutemail.com': true,
    'guerrillamail.com': true,
    'mailinator.com': true,
    'tempmail.com': true,
    'yopmail.com': true
  };

  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeEmail(value) {
    return cleanText(value).toLowerCase();
  }

  function normalizePhone(value) {
    var raw = cleanText(value).replace(/[\s().-]/g, '');
    if (/^\+91\d{10}$/.test(raw)) return raw.slice(3);
    if (/^91\d{10}$/.test(raw)) return raw.slice(2);
    if (/^0\d{10}$/.test(raw)) return raw.slice(1);
    return raw.replace(/^\+/, '');
  }

  function hasObviousSequence(value) {
    var s = String(value || '').toLowerCase().replace(/\D/g, '');
    if (s.length < 6) return false;
    var ascending = '01234567890123456789';
    var descending = '98765432109876543210';
    return ascending.indexOf(s) !== -1 || descending.indexOf(s) !== -1;
  }

  function hasRepeatedRun(value) {
    return /(.)\1{4,}/i.test(String(value || '').replace(/\s/g, ''));
  }

  function containsPlaceholder(value) {
    var normalized = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalized) return false;
    var words = normalized.split(' ');
    for (var i = 0; i < words.length; i += 1) {
      if (PLACEHOLDER_WORDS[words[i]]) return true;
    }
    return false;
  }

  function validateName(value) {
    var name = cleanText(value);
    if (name.length < 2 || name.length > 80) return 'Enter a name between 2 and 80 characters.';
    if (!/^[A-Za-z\u00C0-\u024F\u0900-\u097F][A-Za-z\u00C0-\u024F\u0900-\u097F .'-]*$/.test(name)) {
      return 'Use letters, spaces, apostrophes, hyphens or periods only.';
    }
    if (containsPlaceholder(name) || hasRepeatedRun(name)) return 'Enter your real full name.';
    return '';
  }

  function validateEmail(value) {
    var email = normalizeEmail(value);
    if (email.length < 6 || email.length > 254) return 'Enter a valid email address.';
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) {
      return 'Enter a valid email address.';
    }
    var parts = email.split('@');
    if (containsPlaceholder(parts[0]) || DISPOSABLE_EMAIL_DOMAINS[parts[1]]) {
      return 'Use a permanent personal or work email address.';
    }
    return '';
  }

  function validatePhone(value) {
    var phone = normalizePhone(value);
    if (!/^[6-9]\d{9}$/.test(phone)) return 'Enter a valid 10-digit Indian mobile number.';
    if (hasRepeatedRun(phone) || hasObviousSequence(phone)) return 'Enter a valid mobile number.';
    return '';
  }

  function validateHumanText(value, label, min, max, required) {
    var text = cleanText(value);
    if (!text && !required) return '';
    if (text.length < min || text.length > max) {
      return 'Enter a valid ' + label.toLowerCase() + '.';
    }
    if (containsPlaceholder(text) || hasRepeatedRun(text)) {
      return 'Enter a valid ' + label.toLowerCase() + '.';
    }
    var compact = text.replace(/\s+/g, '');
    if (/^\d+$/.test(compact) || /^[A-Za-z]{2,}\d{3,}$/.test(compact) || /^\d{3,}[A-Za-z]{2,}$/.test(compact)) {
      return 'Enter a valid ' + label.toLowerCase() + '.';
    }
    return '';
  }

  function isIsoDate(value) {
    var s = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var parts = s.split('-').map(Number);
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
    return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
  }

  function isTime(value) {
    if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return false;
    var parts = String(value).split(':').map(Number);
    return parts[0] >= 0 && parts[0] <= 23 && parts[1] >= 0 && parts[1] <= 59;
  }

  function timeToMinutes(value) {
    if (!isTime(value)) return NaN;
    var p = String(value).split(':').map(Number);
    return p[0] * 60 + p[1];
  }

  function minutesToTime(value) {
    var n = Number(value);
    var hours = Math.floor(n / 60);
    var minutes = n % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    var a1 = typeof startA === 'number' ? startA : timeToMinutes(startA);
    var a2 = typeof endA === 'number' ? endA : timeToMinutes(endA);
    var b1 = typeof startB === 'number' ? startB : timeToMinutes(startB);
    var b2 = typeof endB === 'number' ? endB : timeToMinutes(endB);
    return a1 < b2 && a2 > b1;
  }

  function isWeekend(dateString) {
    if (!isIsoDate(dateString)) return false;
    var p = dateString.split('-').map(Number);
    var day = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0)).getUTCDay();
    return day === 0 || day === 6;
  }

  function weekdayCode(dateString) {
    var names = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var p = dateString.split('-').map(Number);
    return names[new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0)).getUTCDay()];
  }

  function dateInRange(date, from, to) {
    return isIsoDate(date) && isIsoDate(from) && isIsoDate(to) && date >= from && date <= to;
  }

  function canonicalize(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalize(value[key]);
    }).join(',') + '}';
  }

  function safeCell(value) {
    if (typeof value !== 'string') return value;
    var clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    return /^[=+\-@]/.test(clean) ? "'" + clean : clean;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    cleanText: cleanText,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    containsPlaceholder: containsPlaceholder,
    hasObviousSequence: hasObviousSequence,
    hasRepeatedRun: hasRepeatedRun,
    validateName: validateName,
    validateEmail: validateEmail,
    validatePhone: validatePhone,
    validateHumanText: validateHumanText,
    isIsoDate: isIsoDate,
    isTime: isTime,
    timeToMinutes: timeToMinutes,
    minutesToTime: minutesToTime,
    rangesOverlap: rangesOverlap,
    isWeekend: isWeekend,
    weekdayCode: weekdayCode,
    dateInRange: dateInRange,
    canonicalize: canonicalize,
    safeCell: safeCell,
    escapeHtml: escapeHtml
  };
})();
