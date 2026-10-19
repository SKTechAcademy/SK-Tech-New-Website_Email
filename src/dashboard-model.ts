import type {
  DashboardCategory,
  InterviewDashboardResponse,
  PublicDashboardInterview,
  PublicDashboardSlot,
} from "./types";

export type DashboardTab = "all" | "today" | "tomorrow" | "slots" | "jobs";

type UnknownRecord = Record<string, unknown>;

const recordOf = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};

const listOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const textOf = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const result = String(value).trim();
      if (result) return result;
    }
  }
  return "";
};

const numberOf = (fallback: number, ...values: unknown[]): number => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return fallback;
};

export const dateInIndia = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const nextWeekdayAfterTomorrow = (today: string): string => {
  let candidate = addDays(today, 2);
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(`${candidate}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
};

export const categoryForInterview = (
  date: string,
  status = "",
  today = dateInIndia(),
): DashboardCategory => {
  const normalizedStatus = status.toUpperCase();
  if (normalizedStatus.includes("CONFLICT") || normalizedStatus.includes("OVERLAP")) return "conflict";
  if (
    normalizedStatus.includes("UNAVAILABLE") ||
    normalizedStatus.includes("BLOCK") ||
    normalizedStatus.includes("CLOSED") ||
    normalizedStatus.includes("WEEKEND")
  ) return "unavailable";
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date === nextWeekdayAfterTomorrow(today)) return "next-weekday";
  return "later-weekday";
};

const normalizeInterview = (value: unknown, today: string): PublicDashboardInterview | null => {
  const item = recordOf(value);
  const date = textOf(item.date, item.interviewDate);
  const id = textOf(item.id, item.skId, item.reference, item.publicReference);
  if (!date || !id) return null;
  const status = textOf(item.status, item.statusLabel, item.stateCategory, item.displayCategory, item.availabilityStatus);
  return {
    // Only these six presentation values are copied. Any private fields on the
    // raw object are intentionally ignored.
    id: id.slice(0, 30),
    round: textOf(item.round, item.interviewRound, "Interview").slice(0, 90),
    date,
    startTime: textOf(item.startTime, item.from, item.timeFrom).slice(0, 10),
    endTime: textOf(item.endTime, item.to, item.timeTo).slice(0, 10),
    batch: textOf(item.batch, "—").slice(0, 12),
    status: status.slice(0, 40),
    category: categoryForInterview(date, status, today),
  };
};

const normalizeSlot = (value: unknown, inheritedDate = ""): PublicDashboardSlot | null => {
  const item = recordOf(value);
  const date = textOf(item.date, inheritedDate);
  const startTime = textOf(item.startTime, item.from);
  const endTime = textOf(item.endTime, item.to);
  if (!date || !startTime || !endTime) return null;
  return {
    date,
    panelId: textOf(item.panelId, item.id).slice(0, 50),
    panelLabel: textOf(item.panelLabel, item.panel, "Available panel").slice(0, 80),
    startTime: startTime.slice(0, 10),
    endTime: endTime.slice(0, 10),
    remainingCapacity: Math.max(0, Math.floor(numberOf(1, item.remainingCapacity, item.capacity))),
  };
};

export const normalizeDashboardPayload = (
  value: unknown,
  today = dateInIndia(),
): InterviewDashboardResponse => {
  const source = recordOf(value);
  const counts = recordOf(source.counts);
  const interviewGroups = recordOf(source.interviews);
  const rawInterviews = listOf(source.interviews).length
    ? listOf(source.interviews)
    : listOf(interviewGroups.allUpcoming).length
      ? listOf(interviewGroups.allUpcoming)
    : listOf(source.upcoming).length
      ? listOf(source.upcoming)
      : listOf(source.items);
  const interviews = rawInterviews
    .map((item) => normalizeInterview(item, today))
    .filter((item): item is PublicDashboardInterview => Boolean(item))
    .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));

  const availability = recordOf(source.availability);
  const rawSlots = listOf(source.availableSlots).length
    ? listOf(source.availableSlots)
    : listOf(availability.tableRows).length
      ? listOf(availability.tableRows)
      : listOf(source.slots);
  const availableSlots = rawSlots
    .map((item) => normalizeSlot(item))
    .filter((item): item is PublicDashboardSlot => Boolean(item))
    .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));

  const todayCount = interviews.filter((item) => item.date === today).length;
  return {
    generatedAt: textOf(source.generatedAt, source.updatedAt, new Date().toISOString()),
    timezone: textOf(source.timezone, source.timeZone, "Asia/Kolkata"),
    counts: {
      upcoming: Math.floor(numberOf(interviews.length, counts.upcoming, counts.upcomingInterviews, source.upcomingCount)),
      today: Math.floor(numberOf(todayCount, counts.today, counts.todayInterviews, source.todayCount)),
      newOpenings: Math.floor(numberOf(0, counts.newOpenings, source.newOpenings)),
      oldOpenings: Math.floor(numberOf(0, counts.oldOpenings, source.oldOpenings)),
    },
    interviews,
    availableSlots,
  };
};

export const filterDashboardRows = (
  interviews: PublicDashboardInterview[],
  tab: DashboardTab,
  today = dateInIndia(),
): PublicDashboardInterview[] => {
  if (tab === "today") return interviews.filter((item) => item.date === today);
  if (tab === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return interviews.filter((item) => item.date === tomorrow);
  }
  return interviews;
};

export const forthcomingWeekdays = (today = dateInIndia(), count = 5): string[] => {
  const dates: string[] = [];
  let candidate = today;
  for (let attempts = 0; dates.length < count && attempts < 20; attempts += 1) {
    const day = new Date(`${candidate}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(candidate);
    candidate = addDays(candidate, 1);
  }
  return dates;
};

