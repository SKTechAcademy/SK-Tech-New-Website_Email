import "./dashboard.css";

import {
  ALLOW_TEST_IDS,
  ApiError,
  DEMO_MODE,
  bookInterview,
  createRequestId,
  getApi,
  loadAvailability,
  loadJobs,
  loadPublicConfig,
} from "./api";
import { configureAnalytics, initAnalyticsConsent, track } from "./analytics";
import {
  addDays,
  categoryForInterview,
  dateInIndia,
  filterDashboardRows,
  forthcomingWeekdays,
  normalizeDashboardPayload,
  type DashboardTab,
} from "./dashboard-model";
import type {
  AvailabilitySlot,
  InterviewDashboardResponse,
  Job,
  PublicDashboardInterview,
  PublicDashboardSlot,
} from "./types";
import {
  sanitizedText,
  validateEmail,
  validateName,
  validatePhone,
  validatePlainText,
  validateRequiredSelect,
  validateSkId,
  valueOf,
} from "./validation";

const qs = <T extends Element>(selector: string, root: ParentNode = document): T | null => root.querySelector<T>(selector);
const qsa = <T extends Element>(selector: string, root: ParentNode = document): T[] => Array.from(root.querySelectorAll<T>(selector));

const setText = (element: Element | null, value: string): void => {
  if (element) element.textContent = value;
};

const escapeSelector = (value: string): string => {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^a-z0-9_-]/gi, "\\$&");
};

const formatDashboardDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
};

const formatTime = (value: string): string => {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value || "—";
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "pm" : "am"}`;
};

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const isTransient = (error: unknown): boolean =>
  error instanceof ApiError && ["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(error.code);

let toastTimer = 0;
const showToast = (message: string): void => {
  const toast = qs<HTMLElement>("[data-dashboard-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 5_000);
};

const emptyDashboard = (): InterviewDashboardResponse => ({
  generatedAt: new Date().toISOString(),
  timezone: "Asia/Kolkata",
  counts: { upcoming: 0, today: 0, newOpenings: 0, oldOpenings: 0 },
  interviews: [],
  availableSlots: [],
});

interface DisplayRow extends PublicDashboardInterview {
  kind: "booking" | "available";
}

const dateBadge = (row: DisplayRow): string => {
  const status = row.status.toUpperCase();
  if (row.kind === "available") return "Upcoming";
  if (status.includes("CONFLICT") || status.includes("OVERLAP")) return "Conflict";
  if (status.includes("WEEKEND")) return "Weekend unavailable";
  if (status.includes("UNAVAILABLE") || status.includes("BLOCK") || status.includes("CLOSED")) return "Panel unavailable";
  return "Booked";
};

const slotToRow = (slot: PublicDashboardSlot): DisplayRow => ({
  id: "Available",
  round: "",
  date: slot.date,
  startTime: slot.startTime,
  endTime: slot.endTime,
  batch: "",
  status: "AVAILABLE",
  category: categoryForInterview(slot.date, "AVAILABLE"),
  kind: "available",
});

const renderRows = (rows: DisplayRow[], caption: string): void => {
  const body = qs<HTMLTableSectionElement>("[data-dashboard-rows]");
  const empty = qs<HTMLElement>("[data-dashboard-empty]");
  const table = qs<HTMLTableElement>(".dashboard-table");
  const tableCaption = qs<HTMLElement>("[data-table-caption]");
  if (!body || !empty || !table) return;
  setText(tableCaption, caption);
  const fragment = document.createDocumentFragment();
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.dataset.category = row.category;
    tr.dataset.kind = row.kind;
    const values = [row.id || "—", row.round || "—"];
    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    const date = document.createElement("td");
    date.className = "date-cell";
    const badge = document.createElement("span");
    badge.className = "date-badge";
    badge.textContent = dateBadge(row);
    const dateValue = document.createElement("span");
    dateValue.className = "date-value";
    dateValue.textContent = formatDashboardDate(row.date);
    date.append(badge, dateValue);
    tr.append(date);
    [formatTime(row.startTime), formatTime(row.endTime), row.batch || "—"].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    fragment.append(tr);
  });
  body.replaceChildren(fragment);
  table.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;
};

interface JobState {
  items: Job[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  q: string;
  type: string;
  sort: "newest" | "title";
  age: "all" | "new" | "old";
}

const jobState: JobState = { items: [], page: 1, pageSize: 9, total: 0, totalPages: 1, q: "", type: "", sort: "newest", age: "all" };

const postedDateValue = (job: Job): number => {
  const parsed = Date.parse(job.postedDate || "");
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const isNewJob = (job: Job): boolean => {
  const posted = job.postedDate || "";
  if (/\b(old|archived)\b/i.test(posted)) return false;
  if (/\b(new|current|demo)\b/i.test(posted)) return true;
  return Date.now() - postedDateValue(job) <= 14 * 86_400_000;
};

const safePublicUrl = (value?: string): string => {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    return ["https:", "mailto:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
};

const renderJobs = (): void => {
  const grid = qs<HTMLElement>("[data-dashboard-jobs]");
  const status = qs<HTMLElement>("[data-jobs-status]");
  const pagination = qs<HTMLElement>("[data-dashboard-pagination]");
  const range = qs<HTMLElement>("[data-jobs-range]");
  const previous = qs<HTMLButtonElement>("[data-jobs-prev]");
  const next = qs<HTMLButtonElement>("[data-jobs-next]");
  if (!grid || !status || !pagination || !range || !previous || !next) return;

  const filtered = jobState.items.filter((job) => jobState.age === "all" || (jobState.age === "new" ? isNewJob(job) : !isNewJob(job)));
  const sorted = [...filtered].sort((left, right) => jobState.sort === "title"
    ? left.title.localeCompare(right.title)
    : postedDateValue(right) - postedDateValue(left));
  const cards = sorted.map((job) => {
    const article = document.createElement("article");
    article.className = "dashboard-job-card";
    const top = document.createElement("div");
    top.className = "dashboard-job-card__top";
    const badge = document.createElement("span");
    badge.className = `dashboard-job-badge${isNewJob(job) ? "" : " is-old"}`;
    badge.textContent = isNewJob(job) ? "New" : "Old";
    const time = document.createElement("time");
    time.textContent = job.postedDate || "Current opening";
    top.append(badge, time);
    const title = document.createElement("h3");
    title.textContent = job.title || "Open role";
    const company = document.createElement("p");
    company.className = "dashboard-job-card__company";
    company.textContent = job.company || "SK Tech hiring partner";
    const meta = document.createElement("ul");
    meta.className = "dashboard-job-card__meta";
    [job.location, job.employmentType, job.experience, job.salary].filter(Boolean).forEach((value) => {
      const item = document.createElement("li");
      item.textContent = String(value);
      meta.append(item);
    });
    const description = document.createElement("p");
    description.className = "dashboard-job-card__description";
    description.textContent = job.skills.length
      ? `Seeking candidates with ${job.skills.slice(0, 5).join(", ")}. Open the role for complete details.`
      : "Open the role for complete requirements and application details.";
    const skills = document.createElement("div");
    skills.className = "dashboard-job-card__skills";
    job.skills.slice(0, 6).forEach((skill) => {
      const tag = document.createElement("span");
      tag.textContent = skill;
      skills.append(tag);
    });
    const actions = document.createElement("div");
    actions.className = "dashboard-job-card__actions";
    const applyUrl = safePublicUrl(job.applyUrl);
    const details = document.createElement("a");
    details.textContent = "View Details";
    details.href = applyUrl || `mailto:support@mysktech.com?subject=${encodeURIComponent(`Job details: ${job.title}`)}`;
    if (applyUrl.startsWith("https:")) { details.target = "_blank"; details.rel = "noreferrer"; }
    const apply = document.createElement("a");
    apply.className = "is-primary";
    apply.textContent = "Apply Now";
    apply.href = applyUrl || `mailto:support@mysktech.com?subject=${encodeURIComponent(`Application: ${job.title}`)}`;
    if (applyUrl.startsWith("https:")) { apply.target = "_blank"; apply.rel = "noreferrer"; }
    const publicCaption = `${job.title} at ${job.company || "SK Tech hiring partner"}${job.location ? ` · ${job.location}` : ""}\n${applyUrl || window.location.href}`;
    const whatsapp = document.createElement("a");
    whatsapp.textContent = "WhatsApp";
    whatsapp.href = `https://wa.me/?text=${encodeURIComponent(publicCaption)}`;
    whatsapp.target = "_blank";
    whatsapp.rel = "noreferrer";
    const instagram = document.createElement("button");
    instagram.type = "button";
    instagram.textContent = "Instagram";
    instagram.addEventListener("click", async () => {
      try {
        await copyText(publicCaption);
        showToast("Public job caption copied. Paste it into Instagram to share.");
      } catch {
        showToast("Could not copy the caption. Open View Details to share the job link.");
      }
    });
    actions.append(details, apply, whatsapp, instagram);
    article.append(top, title, company, meta, description, skills, actions);
    return article;
  });
  grid.replaceChildren(...cards);
  if (!cards.length) {
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const title = document.createElement("strong");
    title.textContent = "No matching job openings";
    const copy = document.createElement("p");
    copy.textContent = "Try another search, employment type or age filter.";
    empty.append(title, copy);
    grid.append(empty);
  }
  setText(status, `${jobState.total || filtered.length} ${jobState.total === 1 ? "opening" : "openings"}${jobState.q ? ` matching “${jobState.q}”` : ""}.`);
  const first = jobState.total ? (jobState.page - 1) * jobState.pageSize + 1 : 0;
  const last = Math.min(jobState.total, jobState.page * jobState.pageSize);
  range.textContent = `Showing ${first}–${last} of ${jobState.total}`;
  previous.disabled = jobState.page <= 1;
  next.disabled = jobState.page >= jobState.totalPages;
  pagination.hidden = jobState.totalPages <= 1;
};

let dashboardState = emptyDashboard();
let activeTab: DashboardTab = "all";
let refreshSerial = 0;

const renderActiveTable = (): void => {
  const tablePanel = qs<HTMLElement>("[data-table-panel]");
  const jobsPanel = qs<HTMLElement>("[data-jobs-panel]");
  if (!tablePanel || !jobsPanel) return;
  if (activeTab === "jobs") {
    tablePanel.hidden = true;
    jobsPanel.hidden = false;
    renderJobs();
    return;
  }
  tablePanel.hidden = false;
  jobsPanel.hidden = true;
  if (activeTab === "slots") {
    const bookingRows = dashboardState.interviews.map((item) => ({ ...item, kind: "booking" as const }));
    const slotRows = dashboardState.availableSlots.map(slotToRow);
    renderRows([...bookingRows, ...slotRows].sort((left, right) =>
      `${left.date} ${left.startTime} ${left.kind}`.localeCompare(`${right.date} ${right.startTime} ${right.kind}`)
    ), "Available interview slots and booked times");
    return;
  }
  const rows = filterDashboardRows(dashboardState.interviews, activeTab).map((item) => ({ ...item, kind: "booking" as const }));
  renderRows(rows, activeTab === "today" ? "Today's interviews" : activeTab === "tomorrow" ? "Tomorrow's interviews" : "All upcoming interviews");
};

const setActiveTab = (tab: DashboardTab, focus = false): void => {
  activeTab = tab;
  const tabs = qsa<HTMLButtonElement>("[data-dashboard-tab]");
  tabs.forEach((button) => {
    const selected = button.dataset.dashboardTab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  const tablePanel = qs<HTMLElement>("[data-table-panel]");
  if (tablePanel && tab !== "jobs") tablePanel.setAttribute("aria-labelledby", `dashboard-tab-${tab}`);
  renderActiveTable();
  track("section_view", { section: tab === "jobs" ? "dashboard_jobs" : `dashboard_${tab}` });
};

const loadFallbackSlots = async (): Promise<PublicDashboardSlot[]> => {
  const dates = forthcomingWeekdays(dateInIndia(), 5);
  const results = await Promise.allSettled(dates.map((date) => loadAvailability(date, 30)));
  return results.flatMap((result, index) => result.status === "fulfilled"
    ? result.value.slots.map((slot) => ({ ...slot, date: result.value.date || dates[index] || dateInIndia() }))
    : []);
};

const loadJobPage = async (): Promise<void> => {
  const status = qs<HTMLElement>("[data-jobs-status]");
  setText(status, "Loading current job openings…");
  try {
    const result = await loadJobs(jobState.page, jobState.pageSize, jobState.q, jobState.type);
    jobState.items = result.items;
    jobState.total = result.total;
    jobState.totalPages = Math.max(1, result.totalPages);
    renderJobs();
  } catch (error) {
    jobState.items = [];
    jobState.total = 0;
    jobState.totalPages = 1;
    renderJobs();
    setText(status, readableError(error));
  }
};

const renderCounts = (): void => {
  const derivedNew = jobState.items.filter(isNewJob).length;
  const derivedOld = jobState.items.length - derivedNew;
  const counts = {
    ...dashboardState.counts,
    newOpenings: dashboardState.counts.newOpenings || derivedNew,
    oldOpenings: dashboardState.counts.oldOpenings || derivedOld,
  };
  (Object.keys(counts) as Array<keyof typeof counts>).forEach((key) => setText(qs(`[data-count="${key}"]`), String(counts[key])));
};

const refreshDashboard = async (): Promise<void> => {
  const serial = ++refreshSerial;
  const refresh = qs<HTMLButtonElement>("[data-refresh]");
  const tableWrap = qs<HTMLElement>("[data-table-wrap]");
  const updated = qs<HTMLElement>("[data-updated]");
  if (refresh) { refresh.disabled = true; refresh.textContent = "↻ Refreshing…"; }
  tableWrap?.setAttribute("aria-busy", "true");
  setText(updated, "Refreshing live dashboard…");
  const [dashboardResult] = await Promise.allSettled([getApi<unknown>("interviewDashboard"), loadJobPage()]);
  if (serial !== refreshSerial) return;
  if (dashboardResult.status === "fulfilled") {
    dashboardState = normalizeDashboardPayload(dashboardResult.value);
  } else {
    dashboardState = emptyDashboard();
    setText(updated, "Live interview schedule is temporarily unavailable. Job openings remain available.");
  }
  if (!dashboardState.availableSlots.length) {
    try { dashboardState.availableSlots = await loadFallbackSlots(); } catch { /* Keep the view empty and usable. */ }
  }
  if (serial !== refreshSerial) return;
  renderCounts();
  renderActiveTable();
  tableWrap?.setAttribute("aria-busy", "false");
  if (dashboardResult.status === "fulfilled") {
    const updatedAt = new Date(dashboardState.generatedAt);
    const time = Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt;
    setText(updated, `Updated ${new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(time)}`);
  }
  if (refresh) { refresh.disabled = false; refresh.textContent = "↻ Refresh"; }
};

const initDashboardTabs = (): void => {
  const tabs = qsa<HTMLButtonElement>("[data-dashboard-tab]");
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => setActiveTab((button.dataset.dashboardTab || "all") as DashboardTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      const nextTab = tabs[next];
      if (nextTab) setActiveTab((nextTab.dataset.dashboardTab || "all") as DashboardTab, true);
    });
  });
  qsa<HTMLButtonElement>("[data-summary-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = (button.dataset.summaryTab || "all") as DashboardTab;
    if (button.dataset.jobAge) {
      jobState.age = button.dataset.jobAge as "new" | "old";
      qsa<HTMLButtonElement>("[data-age]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.age === jobState.age)));
    }
    setActiveTab(tab, true);
  }));
};

const initJobControls = (): void => {
  const form = qs<HTMLFormElement>("[data-dashboard-job-filters]");
  const previous = qs<HTMLButtonElement>("[data-jobs-prev]");
  const next = qs<HTMLButtonElement>("[data-jobs-next]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    jobState.q = valueOf(data, "q");
    jobState.type = valueOf(data, "type");
    jobState.sort = valueOf(data, "sort") === "title" ? "title" : "newest";
    jobState.page = 1;
    track("jobs_searched", { result: "submitted" });
    void loadJobPage().then(renderCounts);
  });
  qs<HTMLSelectElement>("[name='sort']", form || document)?.addEventListener("change", () => {
    const data = form ? new FormData(form) : null;
    jobState.sort = data && valueOf(data, "sort") === "title" ? "title" : "newest";
    renderJobs();
  });
  qsa<HTMLButtonElement>("[data-age]").forEach((button) => button.addEventListener("click", () => {
    jobState.age = (button.dataset.age || "all") as JobState["age"];
    qsa<HTMLButtonElement>("[data-age]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    renderJobs();
  }));
  previous?.addEventListener("click", () => { if (jobState.page > 1) { jobState.page -= 1; void loadJobPage(); } });
  next?.addEventListener("click", () => { if (jobState.page < jobState.totalPages) { jobState.page += 1; void loadJobPage(); } });
};

class BookingWizard {
  private form: HTMLFormElement;
  private dialog: HTMLDialogElement;
  private step = 1;
  private requestId = "";
  private availableSlots: AvailabilitySlot[] = [];
  private horizonDays = 14;

  constructor(dialog: HTMLDialogElement, form: HTMLFormElement) {
    this.dialog = dialog;
    this.form = form;
    qsa<HTMLButtonElement>("[data-open-booking]").forEach((button) => button.addEventListener("click", () => this.open()));
    qs<HTMLButtonElement>("[data-close-booking]", form)?.addEventListener("click", () => this.close());
    qs<HTMLButtonElement>("[data-cancel-booking]", form)?.addEventListener("click", () => this.close());
    qs<HTMLButtonElement>("[data-wizard-back]", form)?.addEventListener("click", () => this.goTo(this.step - 1));
    qs<HTMLButtonElement>("[data-wizard-next]", form)?.addEventListener("click", () => {
      if (this.validateStep(this.step)) this.goTo(this.step + 1);
    });
    qs<HTMLSelectElement>("[data-wizard-technology]", form)?.addEventListener("change", () => this.toggleOtherTechnology());
    qs<HTMLInputElement>("[data-wizard-date]", form)?.addEventListener("change", () => void this.loadWizardSlots());
    qs<HTMLSelectElement>("[data-wizard-duration]", form)?.addEventListener("change", () => void this.loadWizardSlots());
    form.addEventListener("submit", (event) => { event.preventDefault(); void this.submit(); });
    form.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) this.setError(target.name, "");
    });
    dialog.addEventListener("cancel", () => this.reset());
    this.setDateBounds();
  }

  setHorizonDays(days: number): void {
    this.horizonDays = Math.min(180, Math.max(1, Number(days) || 14));
    this.setDateBounds();
  }

  private setDateBounds(): void {
    const input = qs<HTMLInputElement>("[data-wizard-date]", this.form);
    if (!input) return;
    input.min = dateInIndia();
    input.max = addDays(dateInIndia(), this.horizonDays);
  }

  private open(): void {
    if (!this.dialog.open) this.dialog.showModal();
    this.goTo(1);
    window.setTimeout(() => qs<HTMLInputElement>("[name='email']", this.form)?.focus(), 0);
    track("interview_booking_started", { form: "dashboard_booking" });
  }

  private close(): void {
    this.dialog.close();
    this.reset();
  }

  private reset(): void {
    this.form.reset();
    this.step = 1;
    this.availableSlots = [];
    this.requestId = "";
    this.toggleOtherTechnology();
    this.clearErrors();
    this.setStatus("");
    this.renderSlots([], "Select a date to see available panels and times.");
    this.goTo(1);
  }

  private goTo(step: number): void {
    this.step = Math.max(1, Math.min(4, step));
    qsa<HTMLElement>("[data-wizard-step]", this.form).forEach((panel) => { panel.hidden = Number(panel.dataset.wizardStep) !== this.step; });
    qsa<HTMLElement>("[data-progress-step]", this.form).forEach((item) => {
      const itemStep = Number(item.dataset.progressStep);
      item.classList.toggle("is-current", itemStep === this.step);
      item.classList.toggle("is-complete", itemStep < this.step);
      if (itemStep === this.step) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
    });
    const back = qs<HTMLButtonElement>("[data-wizard-back]", this.form);
    const next = qs<HTMLButtonElement>("[data-wizard-next]", this.form);
    const save = qs<HTMLButtonElement>("[data-wizard-save]", this.form);
    if (back) back.hidden = this.step === 1;
    if (next) next.hidden = this.step === 4;
    if (save) save.hidden = this.step !== 4;
    this.setStatus("");
    qs<HTMLInputElement | HTMLSelectElement>("input:not([type='hidden']), select", qs(`[data-wizard-step="${this.step}"]`, this.form) || this.form)?.focus();
  }

  private setStatus(message: string): void { setText(qs("[data-wizard-status]", this.form), message); }

  private setError(field: string, message: string): void {
    if (!field) return;
    const error = qs<HTMLElement>(`[data-wizard-error="${escapeSelector(field)}"]`, this.form);
    const input = qs<HTMLInputElement | HTMLSelectElement>(`[name="${escapeSelector(field)}"]`, this.form);
    setText(error, message);
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  private clearErrors(): void {
    qsa<HTMLElement>("[data-wizard-error]", this.form).forEach((error) => { error.textContent = ""; });
    qsa<HTMLInputElement | HTMLSelectElement>("[aria-invalid]", this.form).forEach((input) => input.removeAttribute("aria-invalid"));
  }

  private applyErrors(errors: Record<string, string>): boolean {
    const meaningful = Object.entries(errors).filter(([, message]) => Boolean(message));
    meaningful.forEach(([field, message]) => this.setError(field, message));
    const first = meaningful[0];
    if (first) qs<HTMLInputElement | HTMLSelectElement>(`[name="${escapeSelector(first[0])}"]`, this.form)?.focus();
    return meaningful.length === 0;
  }

  private validateStep(step: number): boolean {
    this.clearErrors();
    const data = new FormData(this.form);
    const errors: Record<string, string> = {};
    if (step === 1) {
      errors.email = validateEmail(valueOf(data, "email"));
      errors.skId = validateSkId(valueOf(data, "skId"), ALLOW_TEST_IDS);
      errors.fullName = validateName(valueOf(data, "fullName"));
      errors.batch = validateRequiredSelect(valueOf(data, "batch"), "Batch");
    }
    if (step === 2) {
      errors.round = validateRequiredSelect(valueOf(data, "round"), "Round");
      errors.technology = validateRequiredSelect(valueOf(data, "technology"), "Technology");
      if (valueOf(data, "technology") === "Other") errors.technologyOther = validatePlainText(valueOf(data, "technologyOther"), "Technology", { min: 2, max: 80 });
      errors.company = validatePlainText(valueOf(data, "company"), "Interview company", { min: 2, max: 100 });
    }
    if (step === 3) {
      errors.hrName = validateName(valueOf(data, "hrName"), "HR name");
      errors.hrPhone = validatePhone(valueOf(data, "hrPhone"), true, "HR number");
      errors.hrEmail = validateEmail(valueOf(data, "hrEmail"));
    }
    if (step === 4) {
      const date = valueOf(data, "date");
      errors.date = date ? "" : "Interview date is required.";
      if (date && (date < dateInIndia() || date > addDays(dateInIndia(), this.horizonDays))) errors.date = "Choose a date inside the booking window.";
      const slotIndex = Number(valueOf(data, "slot"));
      if (!valueOf(data, "slot") || !Number.isInteger(slotIndex) || !this.availableSlots[slotIndex]) errors.slot = "Choose a live available panel and time.";
    }
    const valid = this.applyErrors(errors);
    if (!valid) {
      this.setStatus("Please correct the highlighted fields.");
      track("validation_error", { form: "dashboard_booking", field: Object.keys(errors).find((field) => errors[field]) || "form" });
    }
    return valid;
  }

  private toggleOtherTechnology(): void {
    const technology = qs<HTMLSelectElement>("[data-wizard-technology]", this.form);
    const other = qs<HTMLElement>("[data-wizard-other]", this.form);
    const input = qs<HTMLInputElement>("[name='technologyOther']", this.form);
    const visible = technology?.value === "Other";
    if (other) other.hidden = !visible;
    if (input) { input.required = visible; if (!visible) input.value = ""; }
  }

  private async loadWizardSlots(): Promise<void> {
    const date = qs<HTMLInputElement>("[data-wizard-date]", this.form)?.value || "";
    const duration = Number(qs<HTMLSelectElement>("[data-wizard-duration]", this.form)?.value || 30);
    if (!date) { this.renderSlots([], "Select a date to see available panels and times."); return; }
    const select = qs<HTMLSelectElement>("[data-wizard-slots]", this.form);
    if (select) { select.disabled = true; select.replaceChildren(new Option("Checking live availability…", "")); }
    try {
      const result = await loadAvailability(date, duration);
      this.availableSlots = result.slots;
      const message = result.weekendClosed && !result.specialOpen
        ? "Saturday and Sunday are closed unless a special opening is published."
        : result.slots.length
          ? `${result.slots.length} live ${result.slots.length === 1 ? "time" : "times"} available.`
          : "No panel is available for this date and duration.";
      this.renderSlots(result.slots, message);
      track("availability_checked", { count: result.slots.length, weekend: result.weekendClosed, special_open: result.specialOpen });
    } catch (error) {
      this.availableSlots = [];
      this.renderSlots([], readableError(error));
    }
  }

  private renderSlots(slots: AvailabilitySlot[], message: string): void {
    const select = qs<HTMLSelectElement>("[data-wizard-slots]", this.form);
    if (select) {
      const options = [new Option(slots.length ? "Select an available time" : "No available times", "")];
      slots.forEach((slot, index) => options.push(new Option(
        `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)} · ${slot.panelLabel} · ${slot.remainingCapacity} left`,
        String(index),
      )));
      select.replaceChildren(...options);
      select.disabled = false;
    }
    setText(qs("[data-wizard-slot-note]", this.form), message);
  }

  private setBusy(busy: boolean): void {
    qsa<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input, select, button", this.form).forEach((control) => {
      if (busy) {
        control.dataset.wasDisabled = control.disabled ? "true" : "false";
        control.disabled = true;
      } else {
        control.disabled = control.dataset.wasDisabled === "true";
        delete control.dataset.wasDisabled;
      }
    });
    this.form.setAttribute("aria-busy", String(busy));
  }

  private async submit(): Promise<void> {
    if (!this.validateStep(4)) return;
    const data = new FormData(this.form);
    const slot = this.availableSlots[Number(valueOf(data, "slot"))];
    if (!slot) return;
    const technology = valueOf(data, "technology") === "Other"
      ? sanitizedText(valueOf(data, "technologyOther"))
      : valueOf(data, "technology");
    const booking = {
      skId: valueOf(data, "skId").replace(/\s/g, "").toUpperCase(),
      email: valueOf(data, "email").toLowerCase(),
      fullName: sanitizedText(valueOf(data, "fullName")),
      batch: valueOf(data, "batch"),
      panelId: slot.panelId,
      date: valueOf(data, "date"),
      startTime: slot.startTime,
      endTime: slot.endTime,
      round: valueOf(data, "round"),
      technology,
      company: sanitizedText(valueOf(data, "company")),
      hrName: sanitizedText(valueOf(data, "hrName")),
      hrPhone: valueOf(data, "hrPhone"),
      hrEmail: valueOf(data, "hrEmail").toLowerCase(),
    };
    this.requestId ||= createRequestId("dashboard-interview-booking");
    this.setBusy(true);
    this.setStatus("Rechecking the panel and saving your interview…");
    try {
      await bookInterview(this.requestId, "", booking, valueOf(data, "website"));
      this.requestId = "";
      this.dialog.close();
      this.reset();
      showToast("Interview booked. Confirmation and rescheduling details are being sent by email.");
      track("interview_booking_completed", { form: "dashboard_booking", result: "confirmed" });
      await refreshDashboard();
    } catch (error) {
      if (!isTransient(error)) this.requestId = "";
      if (error instanceof ApiError) Object.entries(error.fieldErrors).forEach(([field, message]) => this.setError(field, message));
      this.setStatus(`${readableError(error)}${isTransient(error) ? " You can retry safely." : ""}`);
      if (error instanceof ApiError && ["SLOT_BLOCKED", "SLOT_UNAVAILABLE", "CAPACITY_FULL"].includes(error.code)) {
        void this.loadWizardSlots();
      }
    } finally {
      this.setBusy(false);
    }
  }
}

const init = (): void => {
  if (DEMO_MODE) {
    const livePill = qs<HTMLElement>(".live-pill");
    if (livePill) livePill.textContent = "Demo preview";
  }
  const today = new Date(`${dateInIndia()}T12:00:00Z`);
  setText(qs("[data-today-badge]"), new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).format(today).replace(" ", "\n"));
  initDashboardTabs();
  initJobControls();
  qs<HTMLButtonElement>("[data-refresh]")?.addEventListener("click", () => void refreshDashboard());
  const dialog = qs<HTMLDialogElement>("[data-booking-dialog]");
  const form = qs<HTMLFormElement>("[data-booking-wizard]");
  const wizard = dialog && form ? new BookingWizard(dialog, form) : null;
  void loadPublicConfig().then((config) => {
    configureAnalytics(config.ga4MeasurementId || "");
    wizard?.setHorizonDays(config.bookingHorizonDays);
  }).catch(() => { /* Conservative booking defaults remain active. */ });
  initAnalyticsConsent(() => showToast("Analytics is not configured in this environment."));
  void refreshDashboard();
};

init();

