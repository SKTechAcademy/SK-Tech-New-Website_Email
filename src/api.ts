import type {
  ApiEnvelope,
  AvailabilityResponse,
  BookingLookupResponse,
  JobsResponse,
  OperationResponse,
  OperationStatusResponse,
  PublicConfigResponse,
  VerificationRequestResponse,
  VerificationResponse,
} from "./types";

const API_URL = String(import.meta.env.VITE_API_URL || "").trim();
export const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE || "").toLowerCase() === "true";
export const ALLOW_TEST_IDS = DEMO_MODE || String(import.meta.env.VITE_ENVIRONMENT || "").toUpperCase() === "STAGING";
const REQUEST_TIMEOUT_MS = 20_000;
const FALLBACK_TIMEOUT_MS = 25_000;

export class ApiError extends Error {
  code: string;
  fieldErrors: Record<string, string>;
  status?: number;

  constructor(message: string, code = "REQUEST_FAILED", fieldErrors: Record<string, string> = {}, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.status = status;
  }
}

export const createRequestId = (prefix: string): string => {
  const id = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${id}`;
};

export const createUploadWidgetUrl = (nonce: string): string => {
  if (DEMO_MODE || !API_URL) return "";
  const url = new URL(API_URL);
  url.searchParams.set("action", "uploadWidget");
  url.searchParams.set("origin", window.location.origin);
  url.searchParams.set("nonce", nonce);
  return url.href;
};

const apiUrl = (): string => {
  if (!API_URL) {
    throw new ApiError(
      "This service is not connected yet. Please try again later or contact support.",
      "API_NOT_CONFIGURED",
    );
  }
  return API_URL;
};

const unwrapEnvelope = <T>(envelope: ApiEnvelope<T>, status?: number): T => {
  if (!envelope || typeof envelope !== "object") {
    throw new ApiError("The service returned an unreadable response. Please try again.", "INVALID_RESPONSE", {}, status);
  }
  if (status && status >= 400 || !envelope.ok) {
    throw new ApiError(
      envelope.message || "We could not complete that request. Please try again.",
      envelope.code || "REQUEST_FAILED",
      envelope.fieldErrors || {},
      status,
    );
  }
  if (typeof envelope.data === "undefined") {
    throw new ApiError("The service response was incomplete. Please try again.", "EMPTY_RESPONSE", {}, status);
  }
  return envelope.data;
};

const parseEnvelope = async <T>(response: Response): Promise<T> => {
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("The service returned an unreadable response. Please try again.", "INVALID_RESPONSE", {}, response.status);
  }
  return unwrapEnvelope(envelope, response.status);
};

const withTimeout = async (input: RequestInfo | URL, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The service is taking longer than expected. Please check your connection and try again.", "TIMEOUT");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError("We could not reach the service. Check your connection and try again.", "NETWORK_ERROR");
  } finally {
    window.clearTimeout(timer);
  }
};

export const getApi = async <T>(action: string, params: Record<string, string | number | undefined> = {}): Promise<T> => {
  if (DEMO_MODE) return demoGet<T>(action, params);
  const url = new URL(apiUrl());
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && String(value) !== "") url.searchParams.set(key, String(value));
  });
  try {
    const response = await withTimeout(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    return await parseEnvelope<T>(response);
  } catch (error) {
    // Apps Script deployments sometimes omit CORS on redirects. JSONP is used
    // only for read-only actions and still returns the standard API envelope.
    if (!(error instanceof ApiError) || !["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(error.code)) throw error;
    return jsonpGet<T>(url);
  }
};

export const postApi = async <T>(
  action: string,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<T> => {
  if (DEMO_MODE) return demoPost<T>(action, requestId, payload);
  const message = { action, requestId, ...payload };
  try {
    const response = await withTimeout(apiUrl(), {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "strict-origin-when-cross-origin",
      // text/plain avoids a cross-origin JSON preflight when the endpoint is an Apps Script web app.
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(message),
    });
    return await parseEnvelope<T>(response);
  } catch (error) {
    if (!(error instanceof ApiError) || !["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"].includes(error.code)) throw error;
    // If fetch was processed but its response was blocked, the fallback uses
    // the same requestId. Server idempotency prevents a second write.
    return iframePost<T>(message);
  }
};

const jsonpGet = <T>(url: URL): Promise<T> =>
  new Promise((resolve, reject) => {
    const callbackName = `__sktech_jsonp_${createRequestId("read").replace(/[^a-z0-9]/gi, "")}`;
    const globalObject = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    const cleanup = (): void => {
      window.clearTimeout(timer);
      script.remove();
      delete globalObject[callbackName];
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ApiError("The service is taking longer than expected. Please try again.", "TIMEOUT"));
    }, FALLBACK_TIMEOUT_MS);
    globalObject[callbackName] = (envelope: ApiEnvelope<T>): void => {
      cleanup();
      try {
        resolve(unwrapEnvelope(envelope));
      } catch (error) {
        reject(error);
      }
    };
    const jsonpUrl = new URL(url.href);
    jsonpUrl.searchParams.set("callback", callbackName);
    script.async = true;
    script.src = jsonpUrl.href;
    script.onerror = () => {
      cleanup();
      reject(new ApiError("We could not reach the service. Check your connection and try again.", "NETWORK_ERROR"));
    };
    document.head.append(script);
  });

const isTrustedAppsScriptOrigin = (origin: string): boolean => {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    const configuredHostname = new URL(apiUrl()).hostname.toLowerCase();
    return (
      hostname === configuredHostname ||
      hostname === "script.google.com" ||
      hostname.endsWith(".script.google.com") ||
      hostname === "script.googleusercontent.com" ||
      hostname.endsWith(".script.googleusercontent.com") ||
      hostname.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
};

const iframePost = <T>(message: Record<string, unknown>): Promise<T> =>
  new Promise((resolve, reject) => {
    const nonce = createRequestId("reply");
    const frameName = `sktech_api_${createRequestId("frame").replace(/[^a-z0-9]/gi, "")}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.title = "Secure form submission";
    iframe.hidden = true;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = apiUrl();
    form.target = frameName;
    form.enctype = "application/x-www-form-urlencoded";
    form.hidden = true;
    const transport = document.createElement("input");
    transport.name = "transport";
    transport.value = "iframe";
    const payload = document.createElement("input");
    payload.name = "payload";
    payload.value = JSON.stringify({ ...message, replyOrigin: window.location.origin, nonce });
    form.append(transport, payload);

    const cleanup = (): void => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      form.remove();
      iframe.remove();
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow || !isTrustedAppsScriptOrigin(event.origin)) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data) as unknown; } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      const reply = data as { source?: unknown; nonce?: unknown; payload?: unknown };
      if (reply.source !== "sk-tech-api" || reply.nonce !== nonce) return;
      cleanup();
      try {
        const envelope = typeof reply.payload === "string"
          ? JSON.parse(reply.payload) as ApiEnvelope<T>
          : reply.payload as ApiEnvelope<T>;
        resolve(unwrapEnvelope(envelope));
      } catch (error) {
        reject(error);
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new ApiError("The service is taking longer than expected. You can retry safely.", "TIMEOUT"));
    }, FALLBACK_TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    document.body.append(iframe, form);
    form.submit();
  });

export const requestEmailVerification = (
  requestId: string,
  email: string,
  purpose: "registration" | "booking",
  hp: string,
): Promise<VerificationRequestResponse> =>
  postApi<VerificationRequestResponse>("requestEmailVerification", requestId, { email, purpose: purpose.toUpperCase(), hp });

export const verifyEmail = (
  requestId: string,
  verificationId: string,
  email: string,
  code: string,
): Promise<VerificationResponse> =>
  postApi<VerificationResponse>("verifyEmail", requestId, { verificationId, email, code });

interface RawJob {
  id?: string;
  jobId?: string;
  title?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  experience?: string;
  skills?: string | string[];
  salary?: string;
  applyUrl?: string;
  postedDate?: string;
}

interface RawJobsResponse extends Omit<JobsResponse, "items"> {
  items: RawJob[];
}

export const loadPublicConfig = (): Promise<PublicConfigResponse> =>
  getApi<PublicConfigResponse>("config");

export const loadJobs = async (page: number, pageSize: number, q = "", type = ""): Promise<JobsResponse> => {
  const response = await getApi<RawJobsResponse>("jobs", { page, pageSize, q, type });
  return {
    ...response,
    items: (Array.isArray(response.items) ? response.items : []).map((job) => ({
      id: String(job.id || job.jobId || ""),
      title: String(job.title || ""),
      company: String(job.company || ""),
      location: String(job.location || ""),
      employmentType: String(job.employmentType || ""),
      experience: String(job.experience || ""),
      skills: Array.isArray(job.skills)
        ? job.skills.map(String).filter(Boolean)
        : String(job.skills || "").split(/[,;|]/).map((skill) => skill.trim()).filter(Boolean),
      salary: job.salary ? String(job.salary) : undefined,
      applyUrl: job.applyUrl ? String(job.applyUrl) : undefined,
      postedDate: job.postedDate ? String(job.postedDate) : undefined,
    })),
  };
};

export const loadAvailability = (date: string, durationMinutes: number): Promise<AvailabilityResponse> =>
  getApi<AvailabilityResponse>("availability", { date, durationMinutes });

export const registerCandidate = (
  requestId: string,
  verificationToken: string,
  candidate: Record<string, unknown>,
  hp: string,
  uploadToken = "",
): Promise<OperationResponse> =>
  postApi<OperationResponse>("registerCandidate", requestId, { verificationToken, candidate, hp, uploadToken });

export const bookInterview = (
  requestId: string,
  verificationToken: string,
  booking: Record<string, unknown>,
  hp: string,
): Promise<OperationResponse> =>
  postApi<OperationResponse>("bookInterview", requestId, { verificationToken, booking, hp });

export const lookupBooking = (
  requestId: string,
  publicReference: string,
  manageToken: string,
): Promise<BookingLookupResponse> =>
  postApi<BookingLookupResponse | { booking: BookingLookupResponse }>("bookingLookup", requestId, { publicReference, manageToken })
    .then((response) => "booking" in response ? response.booking : response);

export const rescheduleInterview = (
  requestId: string,
  publicReference: string,
  manageToken: string,
  newSchedule: Record<string, unknown>,
  reason: string,
): Promise<OperationResponse> =>
  postApi<OperationResponse>("rescheduleInterview", requestId, { publicReference, manageToken, newSchedule, reason });

export const operationStatus = (token: string): Promise<OperationStatusResponse> =>
  getApi<OperationStatusResponse>("operationStatus", { token });

const delay = (ms = 420): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const demoJobs: JobsResponse = {
  page: 1,
  pageSize: 6,
  total: 3,
  totalPages: 1,
  items: [
    {
      id: "DEMO-JOB-1",
      title: ".NET Developer — Demo opening",
      company: "Sample Company",
      location: "Bengaluru",
      employmentType: "Full-time",
      experience: "0–2 years",
      skills: ["C#", "ASP.NET", "SQL"],
      postedDate: "Demo data",
    },
    {
      id: "DEMO-JOB-2",
      title: "QA Engineer — Demo opening",
      company: "Sample Company",
      location: "Hyderabad",
      employmentType: "Full-time",
      experience: "1–3 years",
      skills: ["Testing", "Selenium", "SQL"],
      postedDate: "Demo data",
    },
    {
      id: "DEMO-JOB-3",
      title: "Data Analyst — Demo opening",
      company: "Sample Company",
      location: "Remote",
      employmentType: "Contract",
      experience: "0–2 years",
      skills: ["SQL", "Power BI", "Excel"],
      postedDate: "Demo data",
    },
  ],
};

const demoVerificationIds = new Map<string, string>();

const demoGet = async <T>(action: string, params: Record<string, string | number | undefined>): Promise<T> => {
  await delay(300);
  if (action === "dashboard" || action === "interviewDashboard") {
    const today = new Date();
    const indiaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);
    const plusDays = (days: number): string => {
      const value = new Date(`${indiaDate}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    return {
      generatedAt: new Date().toISOString(),
      timezone: "Asia/Kolkata",
      counts: { upcoming: 4, today: 1, newOpenings: 3, oldOpenings: 0 },
      interviews: [
        { id: "SK99", round: "Interview Supporter not available", date: indiaDate, startTime: "09:00", endTime: "23:00", batch: "4", status: "PANEL_UNAVAILABLE" },
        { id: "SK32", round: "Round 1", date: indiaDate, startTime: "10:30", endTime: "11:30", batch: "2", status: "BOOKED" },
        { id: "SK32", round: "Round 2", date: plusDays(1), startTime: "11:30", endTime: "12:00", batch: "2", status: "BOOKED" },
        { id: "SK54", round: "Technical Round", date: plusDays(2), startTime: "14:00", endTime: "15:00", batch: "3", status: "BOOKED" },
      ],
      availableSlots: Array.from({ length: 9 }, (_, offset) => plusDays(offset))
        .filter(date => ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
        .slice(0, 5).flatMap(date => [
          { date, panelId: "DEMO-PANEL-1", panelLabel: "Demo Panel 1", startTime: "09:00", endTime: "09:30", remainingCapacity: 2 },
          { date, panelId: "DEMO-PANEL-2", panelLabel: "Demo Panel 2", startTime: "15:00", endTime: "15:30", remainingCapacity: 1 },
        ]),
    } as T;
  }
  if (action === "jobs") {
    const q = String(params.q || "").toLowerCase();
    const type = String(params.type || "").toLowerCase();
    const items = demoJobs.items.filter((job) => {
      const haystack = `${job.title} ${job.company} ${job.location} ${job.skills.join(" ")}`.toLowerCase();
      return (!q || haystack.includes(q)) && (!type || job.employmentType.toLowerCase() === type);
    });
    return { ...demoJobs, items, total: items.length, totalPages: 1 } as T;
  }
  if (action === "config") {
    return {
      environment: "DEMO",
      timezone: "Asia/Kolkata",
      bookingHorizonDays: 14,
      bookingLeadMinutes: 120,
      weekendsClosed: true,
      emailVerificationRequired: true,
      candidateLoginRequired: false,
      turnstileEnabled: false,
    } as T;
  }
  if (action === "availability") {
    const date = String(params.date || "");
    const parsed = new Date(`${date}T12:00:00`);
    const isWeekend = parsed.getDay() === 0 || parsed.getDay() === 6;
    const duration = Number(params.durationMinutes || 30);
    const slots = isWeekend
      ? []
      : [9, 10, 11, 14, 15, 16].map((hour, index) => {
          const endMinutes = hour * 60 + duration;
          return {
            panelId: `DEMO-PANEL-${(index % 3) + 1}`,
            panelLabel: `Demo Panel ${(index % 3) + 1}`,
            startTime: `${String(hour).padStart(2, "0")}:00`,
            endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
            remainingCapacity: index === 2 ? 1 : 2,
          };
        });
    return {
      date,
      timezone: "Asia/Kolkata",
      weekendClosed: isWeekend,
      specialOpen: false,
      slots,
    } as T;
  }
  if (action === "operationStatus") return { status: "CONFIRMED", emailStatus: "QUEUED" } as T;
  throw new ApiError(`Demo action ${action} is not available.`, "DEMO_ACTION_NOT_FOUND");
};

const demoPost = async <T>(
  action: string,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<T> => {
  await delay();
  if (String(payload.hp || "")) throw new ApiError("Request rejected.", "BOT_DETECTED");
  if (action === "requestEmailVerification") {
    const verificationId = `demo-verification-${requestId}`;
    demoVerificationIds.set(verificationId, String(payload.email || "").toLowerCase());
    return { verificationId, expiresInSeconds: 600, emailQueued: true } as T;
  }
  if (action === "verifyEmail") {
    const expectedEmail = demoVerificationIds.get(String(payload.verificationId || ""));
    if (!expectedEmail || expectedEmail !== String(payload.email || "").toLowerCase() || payload.code !== "123456") {
      throw new ApiError("That code is incorrect or has expired. In demo mode, use 123456.", "INVALID_CODE", {
        verificationCode: "Enter the demo code 123456.",
      });
    }
    return { verificationToken: `demo-token-${requestId}`, expiresInSeconds: 900 } as T;
  }
  if (action === "registerCandidate") {
    return { operationToken: `demo-registration-${requestId}`, status: "CONFIRMED", emailQueued: true } as T;
  }
  if (action === "bookInterview") {
    return {
      operationToken: `demo-booking-${requestId}`,
      status: "CONFIRMED",
      emailQueued: true,
    } as T;
  }
  if (action === "bookingLookup") {
    return {
      booking: {
        publicReference: String(payload.publicReference || `BR-${"A".repeat(24)}`),
        status: "CONFIRMED",
        date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        startTime: "10:00",
        endTime: "10:30",
        panelLabel: "Demo Panel 1",
        technology: ".NET",
        round: "Technical Round 1",
        company: "Sample Company",
        timezone: "Asia/Kolkata",
        version: 1,
      },
    } as T;
  }
  if (action === "rescheduleInterview") {
    return { operationToken: `demo-reschedule-${requestId}`, status: "RESCHEDULED", emailQueued: true } as T;
  }
  throw new ApiError(`Demo action ${action} is not available.`, "DEMO_ACTION_NOT_FOUND");
};

