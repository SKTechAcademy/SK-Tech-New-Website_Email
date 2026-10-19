let gaId = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const STORAGE_KEY = "sktech.analytics.consent.v1";

type ConsentValue = "granted" | "denied";
type SafeEvent =
  | "candidate_registration_started"
  | "candidate_registration_completed"
  | "email_verification_requested"
  | "email_verification_completed"
  | "interview_booking_started"
  | "interview_booking_completed"
  | "interview_reschedule_started"
  | "interview_reschedule_completed"
  | "availability_checked"
  | "jobs_searched"
  | "validation_error"
  | "section_view";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let loaded = false;
let consent: ConsentValue | null = null;

const safeStorageGet = (): ConsentValue | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
};

const safeStorageSet = (value: ConsentValue): void => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Consent still applies for the current page when storage is unavailable.
  }
};

const loadGoogleAnalytics = (): void => {
  if (loaded || !gaId || consent !== "granted") return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  // Google tag commands require an Arguments object, not a plain array.
  window.gtag = function () { window.dataLayer.push(arguments); };
  (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = false;
  window.gtag("js", new Date());
  window.gtag("config", gaId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_flags: "SameSite=Lax;Secure",
    page_location: `${window.location.origin}${window.location.pathname}`,
    page_path: window.location.pathname,
    page_referrer: "",
    ...(import.meta.env.DEV ? { debug_mode: true } : {}),
    send_page_view: true,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.append(script);
};

const setConsent = (value: ConsentValue): void => {
  consent = value;
  safeStorageSet(value);
  if (gaId) (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = value !== "granted";
  if (value === "granted") loadGoogleAnalytics();
};

export const initAnalyticsConsent = (onUnavailable?: () => void): void => {
  const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
  const accept = document.querySelector<HTMLButtonElement>("[data-consent-accept]");
  const decline = document.querySelector<HTMLButtonElement>("[data-consent-decline]");
  const openButtons = document.querySelectorAll<HTMLButtonElement>("[data-open-privacy]");

  consent = safeStorageGet();
  if (gaId && consent === null && banner) banner.hidden = false;
  if (consent === "granted") loadGoogleAnalytics();

  accept?.addEventListener("click", () => {
    setConsent("granted");
    if (banner) banner.hidden = true;
  });

  decline?.addEventListener("click", () => {
    setConsent("denied");
    if (banner) banner.hidden = true;
  });

  openButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!gaId) {
        onUnavailable?.();
        return;
      }
      if (banner) banner.hidden = false;
    });
  });
};

export const configureAnalytics = (measurementId: string): void => {
  const clean = String(measurementId || "").trim().toUpperCase();
  if (!/^G-[A-Z0-9]{4,20}$/.test(clean)) return;
  gaId = clean;
  (window as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] = consent !== "granted";
  const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
  if (consent === null && banner) banner.hidden = false;
  if (consent === "granted") loadGoogleAnalytics();
};

// Callers pass only fixed enums, field names or counts. This filter is a second
// line of defence so accidental form values never reach analytics.
export const track = (event: SafeEvent, params: Record<string, string | number | boolean> = {}): void => {
  if (!loaded || consent !== "granted" || typeof window.gtag !== "function") return;
  const safeParams: Record<string, string | number | boolean> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (!/^(section|form|field|result|count|weekend|special_open|page)$/u.test(key)) return;
    if (typeof value === "string") {
      if (!/^[a-z0-9_-]{1,40}$/u.test(value)) return;
      safeParams[key] = value;
      return;
    }
    safeParams[key] = value;
  });
  window.gtag("event", event, safeParams);
};

