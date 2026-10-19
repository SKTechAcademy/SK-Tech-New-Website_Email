import "./styles.css";

import {
  ApiError,
  ALLOW_TEST_IDS,
  DEMO_MODE,
  bookInterview,
  createRequestId,
  createUploadWidgetUrl,
  loadAvailability,
  loadJobs,
  loadPublicConfig,
  lookupBooking,
  registerCandidate,
  requestEmailVerification,
  rescheduleInterview,
  verifyEmail,
} from "./api";
import { configureAnalytics, initAnalyticsConsent, track } from "./analytics";
import type { AvailabilitySlot, BookingLookupResponse, Job, JobsResponse } from "./types";
import {
  type FieldErrors,
  sanitizedText,
  validateBookingReference,
  validateEmail,
  validateManageToken,
  validateName,
  validateOtp,
  validatePhone,
  validatePlainText,
  validateRequiredSelect,
  validateSkId,
  valueOf,
} from "./validation";

const qs = <T extends Element>(selector: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(selector);

const qsa = <T extends Element>(selector: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

const setText = (element: Element | null, value: string): void => {
  if (element) element.textContent = value;
};

const showToast = (message: string, type: "info" | "error" = "info"): void => {
  const region = qs<HTMLElement>("[data-toast-region]");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 5_000);
};

const setStatus = (element: HTMLElement | null, message: string, type: "" | "error" | "success" | "working" = ""): void => {
  if (!element) return;
  element.textContent = message;
  element.className = element.className
    .split(" ")
    .filter((className) => !className.startsWith("is-"))
    .join(" ");
  if (type) element.classList.add(`is-${type}`);
};

const setFieldError = (root: ParentNode, fieldName: string, message: string): void => {
  const field = qs<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${fieldName}"]`, root);
  const error = qs<HTMLElement>(`[data-error-for="${fieldName}"]`, root);
  if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message;
};

const clearFieldErrors = (root: ParentNode): void => {
  qsa<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[aria-invalid]", root).forEach((field) =>
    field.removeAttribute("aria-invalid"),
  );
  qsa<HTMLElement>("[data-error-for]", root).forEach((error) => {
    error.textContent = "";
  });
};

const applyFieldErrors = (root: ParentNode, errors: FieldErrors): void => {
  Object.entries(errors).forEach(([field, message]) => setFieldError(root, field, message));
  const firstInvalid = qs<HTMLElement>("[aria-invalid='true']", root);
  firstInvalid?.focus();
};

const setFormBusy = (form: HTMLFormElement, busy: boolean, busyText: string): void => {
  const controls = qsa<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
    "input, select, textarea, button",
    form,
  );
  if (busy) {
    form.setAttribute("aria-busy", "true");
    controls.forEach((control) => {
      control.dataset.wasDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
    });
    const submit = qs<HTMLButtonElement>("button[type='submit']", form);
    if (submit) {
      submit.dataset.originalText = submit.textContent || "Submit";
      submit.textContent = busyText;
    }
    return;
  }
  form.removeAttribute("aria-busy");
  controls.forEach((control) => {
    control.disabled = control.dataset.wasDisabled === "true";
    delete control.dataset.wasDisabled;
  });
  const submit = qs<HTMLButtonElement>("button[type='submit']", form);
  if (submit?.dataset.originalText) {
    submit.textContent = submit.dataset.originalText;
    delete submit.dataset.originalText;
  }
};

const isTransientError = (error: unknown): boolean =>
  error instanceof ApiError && ["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(error.code);

const readableError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const indiaDate = (daysFromToday = 0): string => {
  const date = new Date(Date.now() + daysFromToday * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const formatDate = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(
    new Date(`${value}T12:00:00+05:30`),
  );
};

const formatTime = (value: string): string => {
  const match = value.match(/^(\d{2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
};

class EmailVerificationController {
  private container: HTMLElement;
  private form: HTMLFormElement;
  private purpose: "registration" | "booking";
  private emailInput: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private verifyButton: HTMLButtonElement;
  private codePanel: HTMLElement;
  private codeInput: HTMLInputElement;
  private help: HTMLElement | null;
  private verificationId = "";
  private verificationToken = "";
  private verifiedEmail = "";
  private expiresAt = 0;
  private sendRequestId = "";
  private verifyRequestId = "";

  constructor(form: HTMLFormElement, purpose: "registration" | "booking") {
    const container = qs<HTMLElement>(`[data-email-verification="${purpose}"]`, form);
    const emailInput = qs<HTMLInputElement>("[name='email']", form);
    const sendButton = qs<HTMLButtonElement>("[data-send-code]", container || form);
    const verifyButton = qs<HTMLButtonElement>("[data-verify-code]", container || form);
    const codePanel = qs<HTMLElement>("[data-code-panel]", container || form);
    const codeInput = qs<HTMLInputElement>("[name='verificationCode']", container || form);
    if (!container || !emailInput || !sendButton || !verifyButton || !codePanel || !codeInput) {
      throw new Error(`Email verification UI is incomplete for ${purpose}.`);
    }
    this.container = container;
    this.form = form;
    this.purpose = purpose;
    this.emailInput = emailInput;
    this.sendButton = sendButton;
    this.verifyButton = verifyButton;
    this.codePanel = codePanel;
    this.codeInput = codeInput;
    this.help = qs<HTMLElement>("[data-verification-help]", container);

    this.sendButton.addEventListener("click", () => void this.sendCode());
    this.verifyButton.addEventListener("click", () => void this.confirmCode());
    this.emailInput.addEventListener("input", () => {
      if (this.verifiedEmail && this.emailInput.value.trim().toLowerCase() !== this.verifiedEmail) this.reset();
    });
  }

  get token(): string {
    if (!this.verificationToken || Date.now() >= this.expiresAt) return "";
    if (this.emailInput.value.trim().toLowerCase() !== this.verifiedEmail) return "";
    return this.verificationToken;
  }

  reset(): void {
    this.verificationId = "";
    this.verificationToken = "";
    this.verifiedEmail = "";
    this.expiresAt = 0;
    this.sendRequestId = "";
    this.verifyRequestId = "";
    this.codeInput.value = "";
    this.codePanel.hidden = true;
    this.container.classList.remove("is-verified");
    this.sendButton.hidden = false;
    this.sendButton.textContent = "Send code";
    setText(this.help, this.purpose === "registration" ? "We will send a 6-digit code to the address above." : "We will send a 6-digit booking verification code.");
    setFieldError(this.form, "verificationCode", "");
  }

  private async sendCode(): Promise<void> {
    const email = this.emailInput.value.trim().toLowerCase();
    const error = validateEmail(email);
    setFieldError(this.form, "email", error);
    if (error) {
      this.emailInput.focus();
      return;
    }
    const hp = qs<HTMLInputElement>("[name='website']", this.form)?.value || "";
    this.sendRequestId ||= createRequestId(`${this.purpose}-email`);
    this.sendButton.disabled = true;
    this.sendButton.textContent = "Sending…";
    try {
      const result = await requestEmailVerification(this.sendRequestId, email, this.purpose, hp);
      // A completed request must never be reused for an explicit resend. We
      // retain the ID only while retrying an uncertain/transient attempt.
      this.sendRequestId = "";
      this.verifyRequestId = "";
      this.verificationToken = "";
      this.expiresAt = 0;
      this.verificationId = result.verificationId;
      this.verifiedEmail = "";
      this.codePanel.hidden = false;
      setText(
        this.help,
        DEMO_MODE
          ? "Demo code: 123456. Production sends this code by email."
          : `Code sent. It expires in ${Math.max(1, Math.round(result.expiresInSeconds / 60))} minutes.`,
      );
      this.codeInput.focus();
      track("email_verification_requested", { form: this.purpose });
      showToast(DEMO_MODE ? "Demo verification code: 123456" : "Verification code sent.");
    } catch (requestError) {
      if (!isTransientError(requestError)) this.sendRequestId = "";
      showToast(readableError(requestError), "error");
    } finally {
      this.sendButton.disabled = false;
      this.sendButton.textContent = this.verificationId ? "Resend code" : "Send code";
    }
  }

  private async confirmCode(): Promise<void> {
    const code = this.codeInput.value.trim();
    const codeError = validateOtp(code);
    setFieldError(this.form, "verificationCode", codeError);
    if (codeError) {
      this.codeInput.focus();
      return;
    }
    if (!this.verificationId) {
      showToast("Send a verification code first.", "error");
      return;
    }
    this.verifyRequestId ||= createRequestId(`${this.purpose}-verify`);
    this.verifyButton.disabled = true;
    this.verifyButton.textContent = "Checking…";
    try {
      const email = this.emailInput.value.trim().toLowerCase();
      const result = await verifyEmail(this.verifyRequestId, this.verificationId, email, code);
      this.verificationToken = result.verificationToken;
      this.verifiedEmail = email;
      this.expiresAt = Date.now() + result.expiresInSeconds * 1000;
      this.container.classList.add("is-verified");
      this.codePanel.hidden = true;
      this.sendButton.hidden = true;
      setText(this.help, "Email verified. You can now submit this form.");
      track("email_verification_completed", { form: this.purpose });
    } catch (requestError) {
      if (requestError instanceof ApiError) applyFieldErrors(this.form, requestError.fieldErrors);
      if (!isTransientError(requestError)) this.verifyRequestId = "";
      showToast(readableError(requestError), "error");
    } finally {
      this.verifyButton.disabled = false;
      this.verifyButton.textContent = "Verify";
    }
  }
}

class CandidateUploadController {
  private section: HTMLElement | null;
  private status: HTMLElement | null;
  private nativeGrid: HTMLElement | null;
  private frame: HTMLIFrameElement | null = null;
  private nonce = createRequestId("upload-frame");
  private ready = false;
  private widgetOrigin = "";
  private selectedCount = 0;
  private valid = true;
  private uploadToken = "";
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private pendingTimer = 0;

  constructor(private form: HTMLFormElement) {
    this.section = qs<HTMLElement>("[data-upload-section]", form);
    this.status = qs<HTMLElement>("[data-upload-status]", form);
    this.nativeGrid = qs<HTMLElement>(".field-grid", this.section || form);
    const widgetUrl = createUploadWidgetUrl(this.nonce);
    if (this.section && widgetUrl) {
      this.frame = document.createElement("iframe");
      this.frame.className = "upload-widget";
      this.frame.title = "Secure candidate document upload";
      this.frame.src = widgetUrl;
      this.frame.loading = "eager";
      this.frame.referrerPolicy = "strict-origin";
      this.nativeGrid?.setAttribute("hidden", "");
      window.addEventListener("message", this.onMessage);
      this.section.insertBefore(this.frame, this.status);
    } else {
      qsa<HTMLInputElement>("input[type='file']", this.section || form).forEach((input) =>
        input.addEventListener("change", () => this.validateNativeFiles()),
      );
      this.validateNativeFiles();
    }
  }

  private onMessage = (event: MessageEvent): void => {
    if (!this.frame || event.source !== this.frame.contentWindow || !this.isTrustedOrigin(event.origin)) return;
    const data = event.data as { source?: unknown; event?: unknown; nonce?: unknown; selectedCount?: unknown; valid?: unknown; message?: unknown; uploadToken?: unknown; fileCount?: unknown };
    if (!data || data.source !== "sk-tech-upload" || data.nonce !== this.nonce) return;
    if (data.event === "ready") {
      this.ready = true;
      this.widgetOrigin = event.origin;
    }
    if (data.event === "state") {
      this.selectedCount = Math.max(0, Number(data.selectedCount) || 0);
      this.valid = data.valid !== false;
      this.uploadToken = "";
      setText(this.status, String(data.message || ""));
    }
    if (data.event === "complete") {
      this.uploadToken = String(data.uploadToken || "");
      setText(this.status, `${Number(data.fileCount) || this.selectedCount} document${(Number(data.fileCount) || this.selectedCount) === 1 ? "" : "s"} uploaded securely.`);
      this.finish(this.uploadToken);
    }
    if (data.event === "error") {
      const message = String(data.message || "Documents could not be uploaded. Please try again.");
      setText(this.status, message);
      this.fail(new Error(message));
    }
  };

  private isTrustedOrigin(origin: string): boolean {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      return host === "script.google.com" || host.endsWith(".script.google.com") ||
        host === "script.googleusercontent.com" || host.endsWith(".script.googleusercontent.com") ||
        host.endsWith(".googleusercontent.com");
    } catch {
      return false;
    }
  }

  private nativeFiles(): File[] {
    return qsa<HTMLInputElement>("input[type='file']", this.section || this.form)
      .flatMap((input) => Array.from(input.files || []));
  }

  private validateNativeFiles(): boolean {
    const files = this.nativeFiles();
    const offerInput = qs<HTMLInputElement>("[name='currentCompanyOfferLetter']", this.section || this.form);
    let message = "";
    if ((offerInput?.files?.length || 0) > 5) message = "Select no more than five offer-letter files.";
    if (files.some((file) => file.size > 10 * 1024 * 1024)) message = "Each document must be 10 MB or smaller.";
    if (files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024) message = "The selected documents must total 30 MB or less.";
    if (files.some((file) => !/\.(pdf|doc|docx|jpe?g|png)$/i.test(file.name))) message = "Documents must be PDF, DOC, DOCX, JPG or PNG files.";
    this.selectedCount = files.length;
    this.valid = !message;
    setText(this.status, message || (files.length ? `${files.length} document${files.length === 1 ? "" : "s"} selected.` : "No documents selected."));
    return this.valid;
  }

  async prepare(email: string, verificationToken: string, requestId: string): Promise<string> {
    if (this.uploadToken) return this.uploadToken;
    if (!this.frame) {
      if (!this.validateNativeFiles()) throw new Error(this.status?.textContent || "Check the selected documents.");
      return "";
    }
    if (!this.valid) throw new Error(this.status?.textContent || "Check the selected documents.");
    if (!this.selectedCount) return "";
    if (!this.ready) throw new Error("The secure document uploader is still loading. Please try again.");
    setText(this.status, "Uploading documents securely…");
    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.pendingTimer = window.setTimeout(() => this.fail(new Error("Document upload timed out. Please try again.")), 90_000);
      this.frame?.contentWindow?.postMessage({
        source: "sk-tech-upload-parent",
        command: "upload",
        nonce: this.nonce,
        email,
        verificationToken,
        requestId,
      }, this.widgetOrigin);
    });
  }

  reset(): void {
    this.uploadToken = "";
    this.selectedCount = 0;
    this.valid = true;
    if (this.widgetOrigin) {
      this.frame?.contentWindow?.postMessage({ source: "sk-tech-upload-parent", command: "reset", nonce: this.nonce }, this.widgetOrigin);
    }
    this.validateNativeFiles();
  }

  private finish(token: string): void {
    window.clearTimeout(this.pendingTimer);
    this.pendingResolve?.(token);
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  private fail(error: Error): void {
    window.clearTimeout(this.pendingTimer);
    this.pendingReject?.(error);
    this.pendingResolve = null;
    this.pendingReject = null;
  }
}

class AvailabilityController {
  private root: HTMLElement;
  private dateInput: HTMLInputElement;
  private durationInput: HTMLSelectElement;
  private checkButton: HTMLButtonElement;
  private status: HTMLElement;
  private grid: HTMLElement;
  private panelInput: HTMLInputElement;
  private startInput: HTMLInputElement;
  private endInput: HTMLInputElement;
  private selected: AvailabilitySlot | null = null;
  private loadedDate = "";

  constructor(root: HTMLElement) {
    const dateInput = qs<HTMLInputElement>("[data-availability-date]", root);
    const durationInput = qs<HTMLSelectElement>("[data-availability-duration]", root);
    const checkButton = qs<HTMLButtonElement>("[data-check-availability]", root);
    const status = qs<HTMLElement>("[data-availability-status]", root);
    const grid = qs<HTMLElement>("[data-slot-grid]", root);
    const panelInput = qs<HTMLInputElement>("[data-slot-panel]", root);
    const startInput = qs<HTMLInputElement>("[data-slot-start]", root);
    const endInput = qs<HTMLInputElement>("[data-slot-end]", root);
    if (!dateInput || !durationInput || !checkButton || !status || !grid || !panelInput || !startInput || !endInput) {
      throw new Error("Availability UI is incomplete.");
    }
    this.root = root;
    this.dateInput = dateInput;
    this.durationInput = durationInput;
    this.checkButton = checkButton;
    this.status = status;
    this.grid = grid;
    this.panelInput = panelInput;
    this.startInput = startInput;
    this.endInput = endInput;
    this.dateInput.min = indiaDate();
    this.dateInput.max = indiaDate(14);
    this.checkButton.addEventListener("click", () => void this.check());
    this.dateInput.addEventListener("change", () => {
      this.clearSelection();
      if (this.dateInput.value) void this.check();
    });
    this.durationInput.addEventListener("change", () => {
      this.clearSelection();
      if (this.dateInput.value) void this.check();
    });
  }

  get selection(): (AvailabilitySlot & { date: string }) | null {
    if (!this.selected || !this.loadedDate) return null;
    return { ...this.selected, date: this.loadedDate };
  }

  reset(message = "Select a date to see available panels and times."): void {
    this.dateInput.value = "";
    this.durationInput.value = "30";
    this.loadedDate = "";
    this.clearSelection();
    setStatus(this.status, message);
  }

  private clearSelection(): void {
    this.selected = null;
    this.panelInput.value = "";
    this.startInput.value = "";
    this.endInput.value = "";
    this.grid.replaceChildren();
  }

  private async check(): Promise<void> {
    const date = this.dateInput.value;
    setFieldError(this.root, "date", date ? "" : "Interview date is required.");
    if (!date) {
      this.dateInput.focus();
      return;
    }
    if (date < indiaDate()) {
      setFieldError(this.root, "date", "Choose today or a future date.");
      this.dateInput.focus();
      return;
    }
    this.clearSelection();
    this.loadedDate = date;
    this.checkButton.disabled = true;
    this.checkButton.textContent = "Checking…";
    setStatus(this.status, "Checking panel blocks and live availability…", "working");
    try {
      const result = await loadAvailability(date, Number(this.durationInput.value));
      if (this.loadedDate !== date) return;
      if (result.weekendClosed && !result.specialOpen) {
        setStatus(this.status, "Saturday and Sunday are closed. Please select a weekday.", "error");
        track("availability_checked", { result: "weekend_closed", weekend: true, special_open: false });
        return;
      }
      if (!result.slots.length) {
        setStatus(this.status, "No panel is available for this date and duration. Try another date.", "error");
        track("availability_checked", { result: "no_slots", count: 0, weekend: result.weekendClosed, special_open: result.specialOpen });
        return;
      }
      setStatus(
        this.status,
        `${result.slots.length} available ${result.slots.length === 1 ? "time" : "times"}${result.specialOpen ? " · special weekend opening" : ""}.`,
        "success",
      );
      this.renderSlots(result.slots);
      track("availability_checked", {
        result: "available",
        count: result.slots.length,
        weekend: result.weekendClosed,
        special_open: result.specialOpen,
      });
    } catch (error) {
      setStatus(this.status, readableError(error), "error");
    } finally {
      this.checkButton.disabled = false;
      this.checkButton.textContent = "Check times";
    }
  }

  private renderSlots(slots: AvailabilitySlot[]): void {
    const fragment = document.createDocumentFragment();
    slots.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-button";
      button.setAttribute("aria-pressed", "false");
      const time = document.createElement("b");
      time.textContent = `${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}`;
      const panel = document.createElement("small");
      panel.textContent = `${slot.panelLabel} · ${slot.remainingCapacity} ${slot.remainingCapacity === 1 ? "place" : "places"} left`;
      button.append(time, panel);
      button.addEventListener("click", () => {
        qsa<HTMLButtonElement>(".slot-button", this.grid).forEach((item) => item.setAttribute("aria-pressed", "false"));
        button.setAttribute("aria-pressed", "true");
        this.selected = slot;
        this.panelInput.value = slot.panelId;
        this.startInput.value = slot.startTime;
        this.endInput.value = slot.endTime;
      });
      fragment.append(button);
    });
    this.grid.replaceChildren(fragment);
  }
}

const initNavigation = (): void => {
  const header = qs<HTMLElement>("[data-site-header]");
  const toggle = qs<HTMLButtonElement>("[data-nav-toggle]");
  const nav = qs<HTMLElement>("[data-primary-nav]");
  const setMenu = (open: boolean): void => {
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav?.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  };
  toggle?.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
  qsa<HTMLAnchorElement>("a[href^='#']", nav || document).forEach((link) => link.addEventListener("click", () => setMenu(false)));
  window.addEventListener("scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 20), { passive: true });

  const observed = qsa<HTMLElement>("main section[id]");
  const navLinks = qsa<HTMLAnchorElement>("a[href^='#']", nav || document);
  const observer = new IntersectionObserver(
    (entries) => {
      const active = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      navLinks.forEach((link) => link.toggleAttribute("aria-current", link.hash === `#${active.target.id}`));
      track("section_view", { section: active.target.id.replace(/[^a-z0-9_-]/g, "").slice(0, 40) });
    },
    { rootMargin: "-20% 0px -60%", threshold: [0.1, 0.4] },
  );
  observed.forEach((section) => observer.observe(section));
};

const initReveal = (): void => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    qsa<HTMLElement>("[data-reveal]").forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8%", threshold: 0.12 },
  );
  qsa<HTMLElement>("[data-reveal]").forEach((item) => observer.observe(item));
};

const renderJobCard = (job: Job): HTMLElement => {
  const article = document.createElement("article");
  article.className = "job-card";
  const top = document.createElement("div");
  top.className = "job-card__top";
  const logo = document.createElement("span");
  logo.className = "job-card__logo";
  logo.textContent = (job.company || "J").slice(0, 1).toUpperCase();
  const type = document.createElement("span");
  type.className = "job-card__type";
  type.textContent = job.employmentType || "Opportunity";
  top.append(logo, type);
  const title = document.createElement("h3");
  title.textContent = job.title || "Open role";
  const company = document.createElement("p");
  company.className = "job-card__company";
  company.textContent = job.company || "Company shared on application";
  const meta = document.createElement("ul");
  meta.className = "job-card__meta";
  [job.location, job.experience, job.salary].filter(Boolean).forEach((value) => {
    const item = document.createElement("li");
    item.textContent = String(value);
    meta.append(item);
  });
  const skills = document.createElement("p");
  skills.className = "job-card__skills";
  skills.textContent = job.skills?.length ? `Skills: ${job.skills.slice(0, 6).join(" · ")}` : "See the role details for required skills.";
  const footer = document.createElement("div");
  footer.className = "job-card__footer";
  const posted = document.createElement("small");
  posted.textContent = job.postedDate || "Current opening";
  const apply = document.createElement("a");
  apply.textContent = "View / apply →";
  const safeUrl = (() => {
    if (!job.applyUrl) return "";
    try {
      const parsed = new URL(job.applyUrl, window.location.href);
      return ["https:", "mailto:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  })();
  if (safeUrl) {
    apply.href = safeUrl;
    if (safeUrl.startsWith("https:")) {
      apply.target = "_blank";
      apply.rel = "noreferrer";
    }
  } else {
    apply.href = "#contact";
    apply.textContent = "Contact us →";
  }
  footer.append(posted, apply);
  article.append(top, title, company, meta, skills, footer);
  return article;
};

const initJobs = (): void => {
  const form = qs<HTMLFormElement>("[data-job-filters]");
  const grid = qs<HTMLElement>("[data-job-grid]");
  const status = qs<HTMLElement>("[data-job-status]");
  const pagination = qs<HTMLElement>("[data-job-pagination]");
  const previous = qs<HTMLButtonElement>("[data-job-prev]");
  const next = qs<HTMLButtonElement>("[data-job-next]");
  const pageText = qs<HTMLElement>("[data-job-page]");
  const jobsSection = qs<HTMLElement>("#jobs");
  if (!form || !grid || !status || !pagination || !previous || !next || !pageText) return;
  let page = 1;
  let totalPages = 1;
  let requestSerial = 0;

  const showEmpty = (title: string, message: string): void => {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const heading = document.createElement("b");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = message;
    empty.append(heading, copy);
    grid.replaceChildren(empty);
  };

  const fetchJobs = async (): Promise<void> => {
    const serial = ++requestSerial;
    grid.replaceChildren(...Array.from({ length: 3 }, () => {
      const skeleton = document.createElement("div");
      skeleton.className = "skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      return skeleton;
    }));
    setText(status, "Loading current opportunities…");
    pagination.hidden = true;
    const data = new FormData(form);
    const q = valueOf(data, "q");
    const type = valueOf(data, "type");
    try {
      const result: JobsResponse = await loadJobs(page, 6, q, type);
      if (serial !== requestSerial) return;
      const items = Array.isArray(result.items) ? result.items : [];
      totalPages = Math.max(1, Number(result.totalPages) || 1);
      if (!items.length) {
        showEmpty("No matching openings", q || type ? "Try a different keyword or employment type." : "New openings will appear here when published by the SK Tech team.");
        setText(status, "No open roles found.");
        return;
      }
      grid.replaceChildren(...items.map(renderJobCard));
      setText(status, `${result.total || items.length} current ${result.total === 1 ? "opening" : "openings"}.`);
      pageText.textContent = `Page ${page} of ${totalPages}`;
      previous.disabled = page <= 1;
      next.disabled = page >= totalPages;
      pagination.hidden = totalPages <= 1;
    } catch (error) {
      if (serial !== requestSerial) return;
      showEmpty("Opportunities are temporarily unavailable", readableError(error));
      setText(status, "Could not load current openings.");
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    page = 1;
    track("jobs_searched", { result: "submitted" });
    void fetchJobs();
  });
  previous.addEventListener("click", () => { if (page > 1) { page -= 1; void fetchJobs(); } });
  next.addEventListener("click", () => { if (page < totalPages) { page += 1; void fetchJobs(); } });
  if (jobsSection && "IntersectionObserver" in window) {
    const lazyLoader = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        lazyLoader.disconnect();
        void fetchJobs();
      },
      { rootMargin: "500px 0px" },
    );
    lazyLoader.observe(jobsSection);
  } else {
    void fetchJobs();
  }
};

const registrationErrors = (data: FormData): FieldErrors => {
  const errors: FieldErrors = {};
  errors.fullName = validateName(valueOf(data, "fullName"));
  errors.email = validateEmail(valueOf(data, "email"));
  errors.emailId = validateEmail(valueOf(data, "emailId"));
  errors.mobileNumber = validatePhone(valueOf(data, "mobileNumber"), true, "Mobile number");
  errors.whatsappNumber = validatePhone(valueOf(data, "whatsappNumber"), true, "WhatsApp number");
  errors.gender = validateRequiredSelect(valueOf(data, "gender"), "Gender");
  errors.education = validateRequiredSelect(valueOf(data, "education"), "Education");
  errors.passoutYear = validateRequiredSelect(valueOf(data, "passoutYear"), "Passout year");
  errors.collegeName = validatePlainText(valueOf(data, "collegeName"), "College name", { min: 3, max: 120 });
  errors.experienceLevel = validateRequiredSelect(valueOf(data, "experienceLevel"), "Experience level");
  errors.currentAddress = validatePlainText(valueOf(data, "currentAddress"), "Current address", { min: 8, max: 250 });
  errors.currentCompany = validatePlainText(valueOf(data, "currentCompany"), "Current company", { min: 2, max: 120 });
  errors.currentCtc = validatePlainText(valueOf(data, "currentCtc"), "Current CTC", { min: 1, max: 40 });
  errors.expectedCtc = validatePlainText(valueOf(data, "expectedCtc"), "Expected CTC", { min: 1, max: 40 });
  errors.noticePeriod = validateRequiredSelect(valueOf(data, "noticePeriod"), "Notice period");
  errors.consent = data.get("consent") === "on" ? "" : "Please confirm your details and contact consent.";
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
};

const initRegistration = (): void => {
  const form = qs<HTMLFormElement>("[data-registration-form]");
  const success = qs<HTMLElement>("[data-registration-success]");
  const another = qs<HTMLButtonElement>("[data-register-another]");
  if (!form || !success || !another) return;
  const status = qs<HTMLElement>("[data-form-status]", form);
  const verification = new EmailVerificationController(form, "registration");
  const uploads = new CandidateUploadController(form);
  let requestId = "";
  let started = false;

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.name) setFieldError(form, target.name, "");
    if (!started) {
      started = true;
      track("candidate_registration_started", { form: "registration" });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    const data = new FormData(form);
    const errors = registrationErrors(data);
    if (!verification.token) errors.email ||= "Verify this email address before registering.";
    if (Object.keys(errors).length) {
      applyFieldErrors(form, errors);
      setStatus(status, "Please correct the highlighted fields.", "error");
      track("validation_error", { form: "registration", field: Object.keys(errors)[0] || "form" });
      return;
    }
    requestId ||= createRequestId("candidate-registration");
    const candidate = {
      fullName: sanitizedText(valueOf(data, "fullName")),
      email: valueOf(data, "email").toLowerCase(),
      emailId: valueOf(data, "emailId").toLowerCase(),
      mobileNumber: valueOf(data, "mobileNumber"),
      whatsappNumber: valueOf(data, "whatsappNumber"),
      gender: valueOf(data, "gender"),
      education: valueOf(data, "education"),
      passoutYear: valueOf(data, "passoutYear"),
      collegeName: sanitizedText(valueOf(data, "collegeName")),
      experienceLevel: valueOf(data, "experienceLevel"),
      currentAddress: sanitizedText(valueOf(data, "currentAddress")),
      currentCompany: sanitizedText(valueOf(data, "currentCompany")),
      currentCtc: sanitizedText(valueOf(data, "currentCtc")),
      expectedCtc: sanitizedText(valueOf(data, "expectedCtc")),
      noticePeriod: valueOf(data, "noticePeriod"),
      consent: true,
      consentTextVersion: "candidate-contact-v1",
    };
    setFormBusy(form, true, "Saving registration…");
    setStatus(status, "Securing any selected documents…", "working");
    try {
      const uploadToken = await uploads.prepare(candidate.email, verification.token, `${requestId}-uploads`);
      setStatus(status, "Saving your candidate record and preparing the confirmation email…", "working");
      await registerCandidate(requestId, verification.token, candidate, valueOf(data, "website"), uploadToken);
      form.hidden = true;
      success.hidden = false;
      success.focus();
      track("candidate_registration_completed", { form: "registration", result: "confirmed" });
      requestId = "";
    } catch (error) {
      if (error instanceof ApiError) applyFieldErrors(form, error.fieldErrors);
      if (!isTransientError(error)) requestId = "";
      setStatus(
        status,
        `${readableError(error)}${isTransientError(error) ? " You can retry safely; the same request ID will be used." : ""}`,
        "error",
      );
    } finally {
      setFormBusy(form, false, "");
    }
  });

  another.addEventListener("click", () => {
    form.reset();
    verification.reset();
    uploads.reset();
    clearFieldErrors(form);
    setStatus(status, "");
    success.hidden = true;
    form.hidden = false;
    started = false;
    qs<HTMLInputElement>("[name='fullName']", form)?.focus();
  });
};

const bookingErrors = (data: FormData): FieldErrors => {
  const errors: FieldErrors = {};
  errors.skId = validateSkId(valueOf(data, "skId"), ALLOW_TEST_IDS);
  errors.email = validateEmail(valueOf(data, "email"));
  errors.fullName = validateName(valueOf(data, "fullName"));
  errors.batch = validateRequiredSelect(valueOf(data, "batch"), "Batch");
  errors.round = validateRequiredSelect(valueOf(data, "round"), "Interview round");
  errors.technology = validateRequiredSelect(valueOf(data, "technology"), "Technology");
  if (valueOf(data, "technology") === "Other") {
    errors.technologyOther = validatePlainText(valueOf(data, "technologyOther"), "Other technology", { min: 2, max: 80 });
  }
  errors.company = validatePlainText(valueOf(data, "company"), "Interview company", { min: 2, max: 100 });
  errors.hrName = validateName(valueOf(data, "hrName"), "HR name");
  errors.hrPhone = validatePhone(valueOf(data, "hrPhone"), true, "HR number");
  errors.hrEmail = validateEmail(valueOf(data, "hrEmail"));
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
};

const initInterviewTabs = (): void => {
  const tabs = qsa<HTMLButtonElement>("[data-interview-tab]");
  const panels = qsa<HTMLElement>("[data-interview-panel]");
  const activate = (name: string, focus = false): void => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.interviewTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.interviewPanel !== name; });
    if (name === "reschedule") track("interview_reschedule_started", { form: "reschedule" });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.interviewTab || "book"));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + tabs.length) % tabs.length;
      const nextTab = tabs[nextIndex];
      if (nextTab) activate(nextTab.dataset.interviewTab || "book", true);
    });
  });
};

const initBooking = (): void => {
  const form = qs<HTMLFormElement>("[data-booking-form]");
  const availabilityRoot = qs<HTMLElement>("[data-availability='booking']");
  const panel = qs<HTMLElement>("[data-interview-panel='book']");
  const success = qs<HTMLElement>("[data-booking-success]");
  const another = qs<HTMLButtonElement>("[data-book-another]");
  if (!form || !availabilityRoot || !panel || !success || !another) return;
  const bookingGrid = qs<HTMLElement>(".booking-grid", panel);
  const status = qs<HTMLElement>("[data-form-status]", form);
  const verification = new EmailVerificationController(form, "booking");
  const availability = new AvailabilityController(availabilityRoot);
  const technology = qs<HTMLSelectElement>("[data-technology-select]", form);
  const otherTechnology = qs<HTMLElement>("[data-other-technology]", form);
  const otherTechnologyInput = qs<HTMLInputElement>("[name='technologyOther']", form);
  const updateOtherTechnology = (): void => {
    const visible = technology?.value === "Other";
    if (otherTechnology) otherTechnology.hidden = !visible;
    if (otherTechnologyInput) {
      otherTechnologyInput.required = visible;
      if (!visible) otherTechnologyInput.value = "";
    }
  };
  technology?.addEventListener("change", updateOtherTechnology);
  updateOtherTechnology();
  let requestId = "";
  let started = false;

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target.name) setFieldError(form, target.name, "");
    if (!started) {
      started = true;
      track("interview_booking_started", { form: "booking" });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    const data = new FormData(form);
    const errors = bookingErrors(data);
    if (!verification.token) errors.email ||= "Verify the registered email before booking.";
    const slot = availability.selection;
    if (!slot) {
      setStatus(qs<HTMLElement>("[data-availability-status]", availabilityRoot), "Choose an available panel and time.", "error");
      errors.date = "Choose a live available time.";
    }
    if (Object.keys(errors).length) {
      applyFieldErrors(form, errors);
      setStatus(status, "Please correct the highlighted fields and choose a time.", "error");
      track("validation_error", { form: "booking", field: Object.keys(errors)[0] || "form" });
      return;
    }
    requestId ||= createRequestId("interview-booking");
    const selectedTechnology = valueOf(data, "technology") === "Other"
      ? sanitizedText(valueOf(data, "technologyOther"))
      : valueOf(data, "technology");
    const booking = {
      skId: valueOf(data, "skId").replace(/\s/g, "").toUpperCase(),
      email: valueOf(data, "email").toLowerCase(),
      fullName: sanitizedText(valueOf(data, "fullName")),
      batch: valueOf(data, "batch"),
      panelId: slot?.panelId,
      date: slot?.date,
      startTime: slot?.startTime,
      endTime: slot?.endTime,
      round: valueOf(data, "round"),
      technology: selectedTechnology,
      company: sanitizedText(valueOf(data, "company")),
      hrName: sanitizedText(valueOf(data, "hrName")),
      hrPhone: valueOf(data, "hrPhone"),
      hrEmail: valueOf(data, "hrEmail").toLowerCase(),
    };
    setFormBusy(form, true, "Confirming booking…");
    setStatus(status, "Rechecking the panel block and saving your booking…", "working");
    try {
      await bookInterview(requestId, verification.token, booking, valueOf(data, "website"));
      if (bookingGrid) bookingGrid.hidden = true;
      success.hidden = false;
      success.focus();
      track("interview_booking_completed", { form: "booking", result: "confirmed" });
      requestId = "";
    } catch (error) {
      if (error instanceof ApiError) applyFieldErrors(form, error.fieldErrors);
      if (!isTransientError(error)) requestId = "";
      setStatus(
        status,
        `${readableError(error)}${isTransientError(error) ? " You can retry safely; the same request ID will be used." : ""}`,
        "error",
      );
      if (error instanceof ApiError && ["SLOT_BLOCKED", "SLOT_UNAVAILABLE", "CAPACITY_FULL"].includes(error.code)) {
        availability.reset("That time is no longer available. Check the date again for alternatives.");
      }
    } finally {
      setFormBusy(form, false, "");
    }
  });

  another.addEventListener("click", () => {
    form.reset();
    updateOtherTechnology();
    verification.reset();
    availability.reset();
    clearFieldErrors(form);
    setStatus(status, "");
    success.hidden = true;
    if (bookingGrid) bookingGrid.hidden = false;
    started = false;
    qs<HTMLInputElement>("[name='skId']", form)?.focus();
  });
};

const renderCurrentBooking = (root: HTMLElement, booking: BookingLookupResponse): void => {
  const title = document.createElement("b");
  title.textContent = "Current confirmed schedule";
  const details = document.createElement("dl");
  const rows: Array<[string, string]> = [
    ["Date", formatDate(booking.date)],
    ["Time", `${formatTime(booking.startTime)} – ${formatTime(booking.endTime)}`],
    ["Panel", booking.panelLabel],
    ["Status", booking.status],
  ];
  if (booking.round) rows.push(["Round", booking.round]);
  if (booking.technology) rows.push(["Technology", booking.technology]);
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    details.append(term, detail);
  });
  root.replaceChildren(title, details);
  root.hidden = false;
};

const initReschedule = (): void => {
  const form = qs<HTMLFormElement>("[data-reschedule-form]");
  const availabilityRoot = qs<HTMLElement>("[data-availability='reschedule']");
  const panel = qs<HTMLElement>("[data-interview-panel='reschedule']");
  const current = qs<HTMLElement>("[data-current-booking]", form || document);
  const lookupButton = qs<HTMLButtonElement>("[data-lookup-booking]", form || document);
  const submit = qs<HTMLButtonElement>("[data-reschedule-submit]", form || document);
  const success = qs<HTMLElement>("[data-reschedule-success]");
  const another = qs<HTMLButtonElement>("[data-reschedule-another]");
  if (!form || !availabilityRoot || !panel || !current || !lookupButton || !submit || !success || !another) return;
  const bookingGrid = qs<HTMLElement>(".booking-grid", panel);
  const status = qs<HTMLElement>("[data-form-status]", form);
  const availability = new AvailabilityController(availabilityRoot);
  let lookup: BookingLookupResponse | null = null;
  let lookupCredentials = "";
  let lookupRequestId = "";
  let rescheduleRequestId = "";

  const invalidateLookup = (): void => {
    if (!lookup) return;
    const data = new FormData(form);
    const credentials = `${valueOf(data, "publicReference")}|${valueOf(data, "manageToken")}`;
    if (credentials !== lookupCredentials) {
      lookup = null;
      lookupCredentials = "";
      lookupRequestId = "";
      current.hidden = true;
      submit.disabled = true;
    }
  };
  qs<HTMLInputElement>("[name='publicReference']", form)?.addEventListener("input", invalidateLookup);
  qs<HTMLInputElement>("[name='manageToken']", form)?.addEventListener("input", invalidateLookup);

  lookupButton.addEventListener("click", async () => {
    clearFieldErrors(form);
    const data = new FormData(form);
    const publicReference = valueOf(data, "publicReference").toUpperCase();
    const manageToken = valueOf(data, "manageToken");
    const errors: FieldErrors = {
      publicReference: validateBookingReference(publicReference),
      manageToken: validateManageToken(manageToken),
    };
    const presentErrors = Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
    if (Object.keys(presentErrors).length) {
      applyFieldErrors(form, presentErrors);
      return;
    }
    lookupRequestId ||= createRequestId("booking-lookup");
    lookupButton.disabled = true;
    lookupButton.textContent = "Finding…";
    setStatus(status, "Securely opening the booking…", "working");
    try {
      lookup = await lookupBooking(lookupRequestId, publicReference, manageToken);
      lookupCredentials = `${publicReference}|${manageToken}`;
      renderCurrentBooking(current, lookup);
      submit.disabled = false;
      setStatus(status, "Booking found. Choose the new schedule and add a reason.", "success");
    } catch (error) {
      if (!isTransientError(error)) lookupRequestId = "";
      setStatus(status, readableError(error), "error");
    } finally {
      lookupButton.disabled = false;
      lookupButton.textContent = "Find booking";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    const data = new FormData(form);
    const errors: FieldErrors = {
      publicReference: validateBookingReference(valueOf(data, "publicReference")),
      manageToken: validateManageToken(valueOf(data, "manageToken")),
      reason: validatePlainText(valueOf(data, "reason"), "Reschedule reason", { min: 5, max: 250 }),
    };
    const slot = availability.selection;
    if (!slot) errors.date = "Choose a new available panel and time.";
    if (!lookup) errors.publicReference ||= "Open this booking before rescheduling.";
    const presentErrors = Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
    if (Object.keys(presentErrors).length) {
      applyFieldErrors(form, presentErrors);
      setStatus(status, "Please correct the highlighted fields and choose a new time.", "error");
      track("validation_error", { form: "reschedule", field: Object.keys(presentErrors)[0] || "form" });
      return;
    }
    const publicReference = valueOf(data, "publicReference").toUpperCase();
    const manageToken = valueOf(data, "manageToken");
    rescheduleRequestId ||= createRequestId("interview-reschedule");
    setFormBusy(form, true, "Saving new schedule…");
    setStatus(status, "Rechecking availability and preserving the original booking history…", "working");
    try {
      await rescheduleInterview(
        rescheduleRequestId,
        publicReference,
        manageToken,
        { panelId: slot?.panelId, date: slot?.date, startTime: slot?.startTime, endTime: slot?.endTime },
        sanitizedText(valueOf(data, "reason")),
      );
      if (bookingGrid) bookingGrid.hidden = true;
      success.hidden = false;
      success.focus();
      track("interview_reschedule_completed", { form: "reschedule", result: "confirmed" });
      rescheduleRequestId = "";
    } catch (error) {
      if (error instanceof ApiError) applyFieldErrors(form, error.fieldErrors);
      if (!isTransientError(error)) rescheduleRequestId = "";
      setStatus(
        status,
        `${readableError(error)}${isTransientError(error) ? " You can retry safely; the same request ID will be used." : ""}`,
        "error",
      );
      if (error instanceof ApiError && ["SLOT_BLOCKED", "SLOT_UNAVAILABLE", "CAPACITY_FULL"].includes(error.code)) {
        availability.reset("That time is no longer available. Check again for alternatives.");
      }
    } finally {
      setFormBusy(form, false, "");
    }
  });

  if (window.location.hash.startsWith("#manage=")) {
    try {
      const credentials = decodeURIComponent(window.location.hash.slice("#manage=".length));
      const separator = credentials.indexOf(":");
      const reference = credentials.slice(0, separator).toUpperCase();
      const token = credentials.slice(separator + 1);
      if (!validateBookingReference(reference) && !validateManageToken(token)) {
        const referenceInput = qs<HTMLInputElement>("[name='publicReference']", form);
        const tokenInput = qs<HTMLInputElement>("[name='manageToken']", form);
        if (referenceInput && tokenInput) {
          referenceInput.value = reference;
          tokenInput.value = token;
          history.replaceState(null, "", `${window.location.pathname}${window.location.search}#interviews`);
          qs<HTMLButtonElement>("[data-interview-tab='reschedule']")?.click();
          qs<HTMLElement>("#interviews")?.scrollIntoView({ block: "start" });
          window.setTimeout(() => lookupButton.click(), 0);
        }
      }
    } catch {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#interviews`);
    }
  }

  another.addEventListener("click", () => {
    form.reset();
    availability.reset("Open your booking, then choose a new date.");
    clearFieldErrors(form);
    setStatus(status, "");
    current.hidden = true;
    current.replaceChildren();
    submit.disabled = true;
    lookup = null;
    lookupCredentials = "";
    lookupRequestId = "";
    success.hidden = true;
    if (bookingGrid) bookingGrid.hidden = false;
    qs<HTMLInputElement>("[name='publicReference']", form)?.focus();
  });
};

const init = (): void => {
  setText(qs("[data-current-year]"), String(new Date().getFullYear()));
  const demoBadge = qs<HTMLElement>("[data-demo-badge]");
  if (demoBadge) demoBadge.hidden = !DEMO_MODE;
  initNavigation();
  initReveal();
  initJobs();
  initRegistration();
  initInterviewTabs();
  initBooking();
  initReschedule();
  void applyPublicRuntimeConfig();
  initAnalyticsConsent(() => showToast("Analytics is not configured in this environment."));
};

const applyPublicRuntimeConfig = async (): Promise<void> => {
  try {
    const config = await loadPublicConfig();
    configureAnalytics(config.ga4MeasurementId || "");
    const horizonDays = Math.min(180, Math.max(1, Number(config.bookingHorizonDays) || 14));
    const maximumDate = indiaDate(horizonDays);
    qsa<HTMLInputElement>("[data-availability-date]").forEach((input) => {
      input.max = maximumDate;
      if (input.value && input.value > maximumDate) input.value = "";
    });
  } catch {
    // Forms remain usable with the conservative 14-day staging default. Each
    // availability request is still authoritatively checked by the server.
  }
};

init();

