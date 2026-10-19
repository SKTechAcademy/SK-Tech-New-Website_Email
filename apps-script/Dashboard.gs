var SK_DASHBOARD_CACHE_SECONDS = 15;
var SK_DASHBOARD_ACTIVE_BOOKING_STATUSES = { SCHEDULED: true, CONFIRMED: true };

/**
 * Public, privacy-minimized data for the interview dashboard.
 *
 * Deliberately excluded: candidate/HR contact details, names, company details,
 * booking/manage tokens, booking IDs, request IDs and internal panel names.
 */
function getInterviewDashboard_(params) {
  var options = normalizeDashboardOptions_(params || {});
  var today = todayLocal_();
  var cacheKey = [
    'interview-dashboard-v1', today, options.durationMinutes, options.slotDays,
    options.interviewLimit, options.jobLimit
  ].join(':');
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (ignore) {}

  var snapshot = {
    bookings: records_('Interview_Bookings'),
    panels: records_('Panels'),
    blocks: records_('Slot_Blocks'),
    specialOpens: records_('Special_Open_Dates'),
    jobs: records_('Jobs')
  };
  options.nowMinutes = localMinutesNow_();
  var result = buildInterviewDashboard_(snapshot, today, options);
  try { cache.put(cacheKey, JSON.stringify(result), SK_DASHBOARD_CACHE_SECONDS); } catch (ignore2) {}
  return result;
}

function normalizeDashboardOptions_(params) {
  var duration = Number(params.durationMinutes || 30);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240 || duration % 15 !== 0) {
    throw appError_('VALIDATION_FAILED', 'Select a valid interview duration.');
  }
  var configuredWindow = Math.min(31, Math.max(1, Number(setting_('BOOKING_WINDOW_DAYS')) || 14));
  return {
    durationMinutes: duration,
    slotDays: clampWholeNumber_(params.slotDays, Math.min(15, configuredWindow + 1), 1, configuredWindow + 1),
    interviewLimit: clampWholeNumber_(params.interviewLimit, 250, 1, 500),
    jobLimit: clampWholeNumber_(params.jobLimit, 50, 1, 100)
  };
}

function clampWholeNumber_(value, fallback, minimum, maximum) {
  var number = Number(value);
  if (!Number.isInteger(number)) number = fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function localMinutesNow_() {
  var timezone = setting_('TIME_ZONE') || 'Asia/Kolkata';
  return Number(Utilities.formatDate(new Date(), timezone, 'H')) * 60 +
    Number(Utilities.formatDate(new Date(), timezone, 'm'));
}

function buildInterviewDashboard_(snapshot, today, options) {
  var tomorrow = addDaysToIsoDate_(today, 1);
  var weekendDays = dashboardWeekendDays_();
  var nextWeekday = nextWeekdayAfter_(tomorrow, weekendDays);
  var maxBookingDate = addDaysToIsoDate_(today, Math.max(1, Number(setting_('BOOKING_WINDOW_DAYS')) || 14));
  var activeBookings = (snapshot.bookings || []).filter(function (booking) {
    return SK_DASHBOARD_ACTIVE_BOOKING_STATUSES[String(booking.status || '').toUpperCase()] &&
      Core.isIsoDate(booking.date) && booking.date >= today &&
      Core.isTime(booking.startTime) && Core.isTime(booking.endTime) &&
      Core.timeToMinutes(booking.endTime) > Core.timeToMinutes(booking.startTime) &&
      isSafePublicId_(booking.candidateId);
  });

  var rows = activeBookings.map(function (booking, index) {
    var unavailable = dashboardBookingUnavailable_(booking, snapshot, weekendDays) || dashboardRoundUnavailable_(booking.round);
    var conflict = dashboardBookingConflict_(booking, index, activeBookings, snapshot.panels || []);
    var dateCategory = dashboardDateCategory_(booking.date, today, tomorrow, nextWeekday);
    var stateCategory = unavailable ? 'PANEL_OR_WEEKEND_UNAVAILABLE' : (conflict ? 'CONFLICT' : 'AVAILABLE');
    return {
      id: String(booking.candidateId),
      round: publicText_(booking.round, 80),
      date: booking.date,
      from: booking.startTime,
      to: booking.endTime,
      batch: publicText_(booking.batch, 20),
      dateCategory: dateCategory,
      stateCategory: stateCategory,
      displayCategory: stateCategory === 'AVAILABLE' ? dateCategory : stateCategory,
      statusLabel: stateCategory === 'AVAILABLE' ? 'BOOKED' : (stateCategory === 'CONFLICT' ? 'CONFLICT' : 'PANEL UNAVAILABLE'),
      hasConflict: conflict,
      panelOrWeekendUnavailable: unavailable
    };
  }).sort(function (a, b) {
    return a.date.localeCompare(b.date) || a.from.localeCompare(b.from) ||
      a.id.localeCompare(b.id) || a.round.localeCompare(b.round);
  });

  var todayRows = rows.filter(function (row) { return row.date === today; });
  var tomorrowRows = rows.filter(function (row) { return row.date === tomorrow; });
  var publicJobs = dashboardPublicJobs_(snapshot.jobs || [], today);
  var newJobs = publicJobs.filter(function (job) { return job.ageCategory === 'NEW'; });
  var oldJobs = publicJobs.filter(function (job) { return job.ageCategory === 'OLD'; });
  var availabilityDays = [];
  var availabilityTableRows = [];
  var totalAvailableSlots = 0;
  var totalAvailableCapacity = 0;
  for (var offset = 0; offset < options.slotDays; offset += 1) {
    var date = addDaysToIsoDate_(today, offset);
    if (date > maxBookingDate) break;
    var availability = computeDashboardAvailabilityDay_(date, options.durationMinutes, snapshot, {
      today: today,
      nowMinutes: options.nowMinutes,
      leadMinutes: Number(setting_('BOOKING_LEAD_MINUTES')) || 0,
      weekendDays: weekendDays,
      tomorrow: tomorrow,
      nextWeekday: nextWeekday
    });
    availabilityDays.push(availability);
    totalAvailableSlots += availability.slotCount;
    totalAvailableCapacity += availability.remainingCapacity;
    availability.slots.forEach(function (slot) {
      var existing = availabilityTableRows.filter(function (row) {
        return row.date === availability.date && row.from === slot.startTime && row.to === slot.endTime;
      })[0];
      if (existing) {
        existing.remainingCapacity += slot.remainingCapacity;
      } else {
        availabilityTableRows.push({
          id: 'Available', round: '', date: availability.date,
          from: slot.startTime, to: slot.endTime, batch: '',
          dateCategory: availability.dateCategory, stateCategory: 'AVAILABLE',
          displayCategory: 'AVAILABLE', statusLabel: 'UPCOMING',
          remainingCapacity: slot.remainingCapacity
        });
      }
    });
  }

  var unavailableRows = buildDashboardUnavailabilityRows_(snapshot, today,
    availabilityDays.length ? availabilityDays[availabilityDays.length - 1].date : today,
    tomorrow, nextWeekday, availabilityDays);
  var explicitBlockRows = unavailableRows.filter(function (row) { return row.sourceCategory === 'SLOT_BLOCK'; });
  var allDashboardRows = rows.concat(explicitBlockRows).sort(dashboardTableRowSort_);
  var allTodayRows = allDashboardRows.filter(function (row) { return row.date === today; });
  var allTomorrowRows = allDashboardRows.filter(function (row) { return row.date === tomorrow; });

  var interviewItems = allDashboardRows.slice(0, options.interviewLimit);
  return {
    code: 'INTERVIEW_DASHBOARD',
    timezone: setting_('TIME_ZONE') || 'Asia/Kolkata',
    generatedAt: nowIso_(),
    refreshAfterSeconds: SK_DASHBOARD_CACHE_SECONDS,
    dates: { today: today, tomorrow: tomorrow, nextWeekday: nextWeekday },
    counts: {
      upcomingInterviews: allDashboardRows.length,
      bookedUpcomingInterviews: rows.length,
      todayInterviews: allTodayRows.length,
      tomorrowInterviews: allTomorrowRows.length,
      availableSlots: totalAvailableSlots,
      availableCapacity: totalAvailableCapacity,
      jobOpenings: publicJobs.length,
      newOpenings: newJobs.length,
      oldOpenings: oldJobs.length
    },
    interviews: {
      allUpcoming: interviewItems,
      today: allTodayRows.slice(0, options.interviewLimit),
      tomorrow: allTomorrowRows.slice(0, options.interviewLimit),
      booked: rows.slice(0, options.interviewLimit),
      unavailable: unavailableRows.slice(0, options.interviewLimit),
      total: allDashboardRows.length,
      bookedTotal: rows.length,
      truncated: allDashboardRows.length > interviewItems.length || unavailableRows.length > options.interviewLimit
    },
    availability: {
      durationMinutes: options.durationMinutes,
      startDate: today,
      endDate: availabilityDays.length ? availabilityDays[availabilityDays.length - 1].date : today,
      days: availabilityDays,
      tableRows: availabilityTableRows
    },
    jobs: {
      active: publicJobs.slice(0, options.jobLimit),
      new: newJobs.slice(0, options.jobLimit),
      old: oldJobs.slice(0, options.jobLimit),
      activeTotal: publicJobs.length,
      newTotal: newJobs.length,
      oldTotal: oldJobs.length,
      truncated: publicJobs.length > options.jobLimit || newJobs.length > options.jobLimit || oldJobs.length > options.jobLimit
    }
  };
}

function dashboardTableRowSort_(a, b) {
  return a.date.localeCompare(b.date) || String(a.from || '').localeCompare(String(b.from || '')) ||
    String(a.id || '').localeCompare(String(b.id || '')) || String(a.round || '').localeCompare(String(b.round || ''));
}

function dashboardRoundUnavailable_(round) {
  return /(?:interview supporter|panel).*not available|(?:panel|weekend)\s+unavailable/i.test(Core.cleanText(round));
}

function buildDashboardUnavailabilityRows_(snapshot, today, endDate, tomorrow, nextWeekday, availabilityDays) {
  var byKey = {};
  function addRow(date, from, to, round, sourceCategory) {
    if (!Core.isIsoDate(date) || date < today || date > endDate) return;
    var safeFrom = Core.isTime(from) ? from : '';
    var safeTo = Core.isTime(to) ? to : '';
    var key = [sourceCategory, date, safeFrom, safeTo].join('|');
    if (byKey[key]) return;
    byKey[key] = {
      id: 'Unavailable', round: round, date: date, from: safeFrom, to: safeTo, batch: '',
      dateCategory: dashboardDateCategory_(date, today, tomorrow, nextWeekday),
      stateCategory: 'PANEL_OR_WEEKEND_UNAVAILABLE',
      displayCategory: 'PANEL_OR_WEEKEND_UNAVAILABLE',
      statusLabel: 'PANEL UNAVAILABLE',
      panelOrWeekendUnavailable: true,
      sourceCategory: sourceCategory
    };
  }

  (snapshot.blocks || []).filter(function (block) {
    return isActiveFlag_(block.active) && Core.isIsoDate(block.dateFrom) && Core.isIsoDate(block.dateTo) &&
      block.dateTo >= today && block.dateFrom <= endDate;
  }).forEach(function (block) {
    var cursor = block.dateFrom < today ? today : block.dateFrom;
    var last = block.dateTo > endDate ? endDate : block.dateTo;
    for (var guard = 0; cursor <= last && guard < 32; guard += 1) {
      addRow(cursor, block.startTime, block.endTime, 'Panel unavailable', 'SLOT_BLOCK');
      cursor = addDaysToIsoDate_(cursor, 1);
    }
  });

  (availabilityDays || []).forEach(function (day) {
    if (day.weekendClosed) addRow(day.date, '', '', 'Weekend unavailable', 'WEEKEND_CLOSED');
  });
  return Object.keys(byKey).map(function (key) { return byKey[key]; }).sort(dashboardTableRowSort_);
}

function dashboardDateCategory_(date, today, tomorrow, nextWeekday) {
  if (date === today) return 'TODAY';
  if (date === tomorrow) return 'TOMORROW';
  if (date === nextWeekday) return 'NEXT_WEEKDAY';
  return 'LATER_WEEKDAYS';
}

function dashboardWeekendDays_() {
  return String(setting_('WEEKEND_DAYS') || 'SAT,SUN').split(',').map(function (value) {
    return value.trim().toUpperCase();
  }).filter(Boolean);
}

function nextWeekdayAfter_(date, weekendDays) {
  var next = date;
  for (var i = 0; i < 7; i += 1) {
    next = addDaysToIsoDate_(next, 1);
    if (weekendDays.indexOf(Core.weekdayCode(next)) === -1) return next;
  }
  return next;
}

function addDaysToIsoDate_(value, days) {
  if (!Core.isIsoDate(value)) throw appError_('INVALID_DATE', 'A valid date is required.');
  var parts = value.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(days), 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function isSafePublicId_(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(String(value || ''));
}

function publicText_(value, maximum) {
  return Core.cleanText(value).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maximum);
}

function dashboardBookingConflict_(booking, bookingIndex, bookings, panels) {
  var start = Core.timeToMinutes(booking.startTime);
  var end = Core.timeToMinutes(booking.endTime);
  var candidateConflict = bookings.some(function (other, index) {
    return index !== bookingIndex && other.candidateId === booking.candidateId && other.date === booking.date &&
      Core.rangesOverlap(start, end, other.startTime, other.endTime);
  });
  if (candidateConflict) return true;

  var panel = panels.filter(function (candidate) {
    return candidate.panelId === booking.panelId && isActiveFlag_(candidate.active) &&
      (!candidate.effectiveFrom || candidate.effectiveFrom <= booking.date) &&
      (!candidate.effectiveTo || candidate.effectiveTo >= booking.date);
  })[0];
  if (!panel) return false;
  var capacity = Math.max(1, Number(panel.capacity) || 1);
  var panelBookings = bookings.filter(function (candidate) {
    return candidate.date === booking.date && candidate.panelId === booking.panelId &&
      Core.isTime(candidate.startTime) && Core.isTime(candidate.endTime) &&
      Core.rangesOverlap(start, end, candidate.startTime, candidate.endTime);
  });
  var points = [start];
  panelBookings.forEach(function (candidate) {
    var point = Core.timeToMinutes(candidate.startTime);
    if (point >= start && point < end && points.indexOf(point) === -1) points.push(point);
  });
  return points.some(function (point) {
    return panelBookings.filter(function (candidate) {
      return Core.timeToMinutes(candidate.startTime) <= point && Core.timeToMinutes(candidate.endTime) > point;
    }).length > capacity;
  });
}

function dashboardBookingUnavailable_(booking, snapshot, weekendDays) {
  var panel = (snapshot.panels || []).filter(function (candidate) {
    return candidate.panelId === booking.panelId && isActiveFlag_(candidate.active) &&
      (!candidate.effectiveFrom || candidate.effectiveFrom <= booking.date) &&
      (!candidate.effectiveTo || candidate.effectiveTo >= booking.date);
  })[0];
  if (!panel) return true;
  var weekday = Core.weekdayCode(booking.date);
  var weekend = weekendDays.indexOf(weekday) !== -1;
  var openRules = (snapshot.specialOpens || []).filter(function (rule) {
    return isActiveFlag_(rule.active) && Core.dateInRange(booking.date, rule.dateFrom, rule.dateTo) &&
      (!rule.panelId || rule.panelId === panel.panelId);
  });
  var workingDays = String(panel.weekdays || '').split(',').map(function (value) { return value.trim().toUpperCase(); });
  if ((weekend || workingDays.indexOf(weekday) === -1) && !openRules.length) return true;

  var intervals = [];
  if (weekend || workingDays.indexOf(weekday) === -1) {
    intervals = openRules.map(function (rule) {
      return { start: rule.startTime || panel.startTime, end: rule.endTime || panel.endTime };
    });
  } else {
    intervals.push({ start: panel.startTime, end: panel.endTime });
    openRules.forEach(function (rule) {
      if (rule.startTime && rule.endTime) intervals.push({ start: rule.startTime, end: rule.endTime });
    });
  }
  var start = Core.timeToMinutes(booking.startTime);
  var end = Core.timeToMinutes(booking.endTime);
  var insideWindow = intervals.some(function (interval) {
    return Core.isTime(interval.start) && Core.isTime(interval.end) &&
      start >= Core.timeToMinutes(interval.start) && end <= Core.timeToMinutes(interval.end);
  });
  if (!insideWindow) return true;

  return (snapshot.blocks || []).some(function (block) {
    if (!isActiveFlag_(block.active) || !Core.dateInRange(booking.date, block.dateFrom, block.dateTo)) return false;
    var validScopes = ['PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'];
    if (validScopes.indexOf(block.scope) === -1) return false;
    var panelScoped = block.scope.indexOf('PANEL_') === 0 || (block.scope === 'DATE_RANGE' && block.panelId);
    if (panelScoped && block.panelId !== panel.panelId) return false;
    if (block.scope === 'PANEL_DAY' || block.scope === 'GLOBAL_DAY' || !block.startTime || !block.endTime) return true;
    return Core.rangesOverlap(booking.startTime, booking.endTime, block.startTime, block.endTime);
  });
}

function computeDashboardAvailabilityDay_(date, durationMinutes, snapshot, context) {
  var weekday = Core.weekdayCode(date);
  var weekend = context.weekendDays.indexOf(weekday) !== -1;
  var panels = (snapshot.panels || []).filter(function (panel) {
    return isActiveFlag_(panel.active) && (!panel.effectiveFrom || panel.effectiveFrom <= date) &&
      (!panel.effectiveTo || panel.effectiveTo >= date);
  });
  var specialOpens = (snapshot.specialOpens || []).filter(function (rule) {
    return isActiveFlag_(rule.active) && Core.dateInRange(date, rule.dateFrom, rule.dateTo);
  });
  var blocks = (snapshot.blocks || []).filter(function (block) {
    return isActiveFlag_(block.active) && Core.dateInRange(date, block.dateFrom, block.dateTo);
  });
  var bookings = (snapshot.bookings || []).filter(function (booking) {
    return booking.date === date && SK_DASHBOARD_ACTIVE_BOOKING_STATUSES[String(booking.status || '').toUpperCase()];
  });
  var slotsByKey = {};
  var potentialUnblockedSlots = 0;

  panels.forEach(function (panel) {
    var openRules = specialOpens.filter(function (rule) { return !rule.panelId || rule.panelId === panel.panelId; });
    var workingDays = String(panel.weekdays || '').split(',').map(function (value) { return value.trim().toUpperCase(); });
    if (weekend && !openRules.length) return;
    if (!weekend && workingDays.indexOf(weekday) === -1 && !openRules.length) return;
    var intervals = [];
    if (weekend || workingDays.indexOf(weekday) === -1) {
      intervals = openRules.map(function (rule) {
        return { start: rule.startTime || panel.startTime, end: rule.endTime || panel.endTime };
      });
    } else {
      intervals.push({ start: panel.startTime, end: panel.endTime });
      openRules.forEach(function (rule) {
        if (rule.startTime && rule.endTime) intervals.push({ start: rule.startTime, end: rule.endTime });
      });
    }
    var increment = Number(panel.slotMinutes) || Number(setting_('DEFAULT_SLOT_MINUTES')) || 30;
    var capacity = Math.max(1, Number(panel.capacity) || 1);
    intervals.forEach(function (interval) {
      var start = Core.timeToMinutes(interval.start);
      var close = Core.timeToMinutes(interval.end);
      if (!Number.isFinite(start) || !Number.isFinite(close) || start >= close) return;
      for (var minute = start; minute + durationMinutes <= close; minute += increment) {
        var startTime = Core.minutesToTime(minute);
        var endTime = Core.minutesToTime(minute + durationMinutes);
        var blocked = blocks.some(function (block) {
          var validScopes = ['PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'];
          if (validScopes.indexOf(block.scope) === -1) return false;
          var panelScoped = block.scope.indexOf('PANEL_') === 0 || (block.scope === 'DATE_RANGE' && block.panelId);
          if (panelScoped && block.panelId !== panel.panelId) return false;
          if (block.scope === 'PANEL_DAY' || block.scope === 'GLOBAL_DAY' || !block.startTime || !block.endTime) return true;
          return Core.rangesOverlap(startTime, endTime, block.startTime, block.endTime);
        });
        if (blocked) continue;
        potentialUnblockedSlots += 1;
        if (date === context.today && minute < context.nowMinutes + context.leadMinutes) continue;
        var used = bookings.filter(function (booking) {
          return booking.panelId === panel.panelId && Core.isTime(booking.startTime) && Core.isTime(booking.endTime) &&
            Core.rangesOverlap(startTime, endTime, booking.startTime, booking.endTime);
        }).length;
        if (used >= capacity) continue;
        var label = publicText_(panel.publicLabel || 'Interview panel', 80) || 'Interview panel';
        var key = label + '|' + startTime + '|' + endTime;
        if (!slotsByKey[key]) {
          slotsByKey[key] = { panelLabel: label, startTime: startTime, endTime: endTime, remainingCapacity: 0 };
        }
        slotsByKey[key].remainingCapacity += capacity - used;
      }
    });
  });

  var slots = Object.keys(slotsByKey).map(function (key) { return slotsByKey[key]; }).sort(function (a, b) {
    return a.startTime.localeCompare(b.startTime) || a.panelLabel.localeCompare(b.panelLabel);
  });
  var remainingCapacity = slots.reduce(function (sum, slot) { return sum + slot.remainingCapacity; }, 0);
  var state = slots.length ? 'AVAILABLE' : (potentialUnblockedSlots ? 'NO_AVAILABLE_SLOTS' : 'PANEL_OR_WEEKEND_UNAVAILABLE');
  return {
    date: date,
    dateCategory: dashboardDateCategory_(date, context.today, context.tomorrow, context.nextWeekday),
    stateCategory: state,
    weekendClosed: weekend && specialOpens.length === 0,
    specialOpen: specialOpens.length > 0,
    slotCount: slots.length,
    remainingCapacity: remainingCapacity,
    slots: slots
  };
}

function dashboardPublicJobs_(jobs, today) {
  var cutoff = addDaysToIsoDate_(today, -29);
  return jobs.filter(function (row) {
    return String(row.status || '').toUpperCase() === 'ACTIVE' && Core.isIsoDate(row.postedDate) && row.postedDate <= today &&
      isSafePublicId_(row.jobId);
  }).map(function (row) {
    var skills = String(row.skills || '').split(/[,;|]/).map(function (value) {
      return publicText_(value, 60);
    }).filter(Boolean).slice(0, 20);
    return {
      id: String(row.jobId),
      company: publicText_(row.company, 120),
      title: publicText_(row.title, 120),
      experience: publicText_(row.experience, 60),
      location: publicText_(row.location, 120),
      skills: skills,
      employmentType: publicText_(row.employmentType, 60),
      salary: publicText_(row.salary, 80),
      applyUrl: /^https:\/\//i.test(String(row.applyUrl || '')) ? String(row.applyUrl) : '',
      postedDate: row.postedDate,
      ageCategory: row.postedDate >= cutoff ? 'NEW' : 'OLD'
    };
  }).sort(function (a, b) {
    return b.postedDate.localeCompare(a.postedDate) || a.id.localeCompare(b.id);
  });
}
