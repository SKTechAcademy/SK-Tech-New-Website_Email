function isActiveFlag_(value) {
  return String(value).toUpperCase() === 'TRUE' || String(value) === '1';
}

function getAvailability_(params) {
  var date = String((params || {}).date || '');
  if (!Core.isIsoDate(date)) throw appError_('VALIDATION_FAILED', 'Select a valid date.', { date: 'Select a valid date.' });
  var duration = Number((params || {}).durationMinutes || 30);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240 || duration % 15 !== 0) {
    throw appError_('VALIDATION_FAILED', 'Select a valid interview duration.');
  }
  if (date < todayLocal_()) throw appError_('DATE_UNAVAILABLE', 'Past dates are unavailable.');
  var max = addDaysToIsoDate_(todayLocal_(), Number(setting_('BOOKING_WINDOW_DAYS')) || 14);
  if (date > max) throw appError_('DATE_UNAVAILABLE', 'This date is outside the booking window.');
  return computeAvailability_(date, duration, '');
}

function computeAvailability_(date, durationMinutes, excludeBookingId) {
  var weekday = Core.weekdayCode(date);
  var weekendDays = String(setting_('WEEKEND_DAYS') || 'SAT,SUN').split(',').map(function (value) {
    return value.trim().toUpperCase();
  });
  var weekend = weekendDays.indexOf(weekday) !== -1;
  var panels = records_('Panels').filter(function (panel) {
    return isActiveFlag_(panel.active) && (!panel.effectiveFrom || panel.effectiveFrom <= date) &&
      (!panel.effectiveTo || panel.effectiveTo >= date);
  });
  var specialOpens = records_('Special_Open_Dates').filter(function (rule) {
    return isActiveFlag_(rule.active) && Core.dateInRange(date, rule.dateFrom, rule.dateTo);
  });
  var blocks = records_('Slot_Blocks').filter(function (block) {
    return isActiveFlag_(block.active) && Core.dateInRange(date, block.dateFrom, block.dateTo);
  });
  var bookings = records_('Interview_Bookings').filter(function (booking) {
    return booking.date === date && booking.bookingId !== excludeBookingId &&
      ['SCHEDULED', 'CONFIRMED'].indexOf(booking.status) !== -1;
  });

  var nowMinutes = Number(Utilities.formatDate(new Date(), setting_('TIME_ZONE'), 'H')) * 60 +
    Number(Utilities.formatDate(new Date(), setting_('TIME_ZONE'), 'm'));
  var leadMinutes = Number(setting_('BOOKING_LEAD_MINUTES')) || 0;
  var slots = [];

  panels.forEach(function (panel) {
    var openRules = specialOpens.filter(function (rule) {
      return !rule.panelId || rule.panelId === panel.panelId;
    });
    var workingDays = String(panel.weekdays || '').split(',').map(function (value) { return value.trim().toUpperCase(); });
    if (weekend && !openRules.length) return;
    if (!weekend && workingDays.indexOf(weekday) === -1 && !openRules.length) return;

    var intervals = [];
    if (weekend || workingDays.indexOf(weekday) === -1) {
      intervals = openRules.map(function (rule) {
        return {
          start: rule.startTime || panel.startTime,
          end: rule.endTime || panel.endTime
        };
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
        var endMinute = minute + durationMinutes;
        var startTime = Core.minutesToTime(minute);
        var endTime = Core.minutesToTime(endMinute);
        if (date === todayLocal_() && minute < nowMinutes + leadMinutes) continue;
        var blocked = blocks.some(function (block) {
          var validScopes = ['PANEL_SLOT', 'PANEL_DAY', 'GLOBAL_SLOT', 'GLOBAL_DAY', 'DATE_RANGE'];
          if (validScopes.indexOf(block.scope) === -1) return false;
          var panelScoped = block.scope.indexOf('PANEL_') === 0 || (block.scope === 'DATE_RANGE' && block.panelId);
          if (panelScoped && block.panelId !== panel.panelId) return false;
          if (block.scope === 'PANEL_DAY' || block.scope === 'GLOBAL_DAY') return true;
          if (!block.startTime || !block.endTime) return true;
          return Core.rangesOverlap(startTime, endTime, block.startTime, block.endTime);
        });
        if (blocked) continue;
        var used = bookings.filter(function (booking) {
          return booking.panelId === panel.panelId &&
            Core.rangesOverlap(startTime, endTime, booking.startTime, booking.endTime);
        }).length;
        if (used >= capacity) continue;
        var key = panel.panelId + '|' + startTime + '|' + endTime;
        if (slots.some(function (existing) { return existing._key === key; })) continue;
        slots.push({
          _key: key,
          panelId: panel.panelId,
          panelLabel: panel.publicLabel,
          startTime: startTime,
          endTime: endTime,
          remainingCapacity: capacity - used
        });
      }
    });
  });

  slots.sort(function (a, b) {
    return a.startTime.localeCompare(b.startTime) || a.panelLabel.localeCompare(b.panelLabel);
  });
  slots.forEach(function (slot) { delete slot._key; });
  return {
    date: date,
    timezone: setting_('TIME_ZONE'),
    weekendClosed: weekend && specialOpens.length === 0,
    specialOpen: specialOpens.length > 0,
    durationMinutes: durationMinutes,
    slots: slots
  };
}

function assertSlotAvailableUnlocked_(schedule, excludeBookingId) {
  var duration = Core.timeToMinutes(schedule.endTime) - Core.timeToMinutes(schedule.startTime);
  if (duration < 15 || duration > 240 || duration % 15 !== 0) {
    throw appError_('SLOT_UNAVAILABLE', 'Select a valid available slot.');
  }
  var availability = computeAvailability_(schedule.date, duration, excludeBookingId || '');
  var match = availability.slots.filter(function (slot) {
    return slot.panelId === schedule.panelId && slot.startTime === schedule.startTime && slot.endTime === schedule.endTime;
  })[0];
  if (!match) throw appError_('SLOT_UNAVAILABLE', 'That slot is no longer available. Please select another slot.');
  return match;
}
