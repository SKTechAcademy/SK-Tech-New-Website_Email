export type FieldErrors = Record<string, string>;

const DUMMY_WORDS = new Set([
  "asdf",
  "demo",
  "dummy",
  "example",
  "fake",
  "hello",
  "invalid",
  "na",
  "none",
  "null",
  "qwerty",
  "sample",
  "test",
  "testing",
  "unknown",
  "user",
  "xyz",
]);

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "fakeinbox.com",
  "guerrillamail.com",
  "mailinator.com",
  "mailnesia.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
]);

const normalize = (value: FormDataEntryValue | null): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

export const containsDummyText = (value: string): boolean => {
  const cleanWords = words(value);
  if (!cleanWords.length) return false;
  if (cleanWords.some((word) => DUMMY_WORDS.has(word))) return true;
  if (/^(.)\1{3,}$/iu.test(value.replace(/\s/g, ""))) return true;
  if (/^(?:abc|abcd|abcdef|qwe|qwerty|xyz)+$/iu.test(value.replace(/\s/g, ""))) return true;
  return false;
};

export const validateName = (value: string, label = "Full name"): string => {
  const clean = normalize(value);
  if (!clean) return `${label} is required.`;
  if (clean.length < 2 || clean.length > 60) return `${label} must be between 2 and 60 characters.`;
  if (/\d/u.test(clean)) return `${label} cannot contain numbers.`;
  if (!/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(clean)) return `Enter a valid ${label.toLowerCase()}.`;
  if (containsDummyText(clean)) return `Enter your genuine ${label.toLowerCase()}.`;
  if (new Set(clean.toLowerCase().replace(/[^\p{L}]/gu, "")).size < 2) return `Enter a valid ${label.toLowerCase()}.`;
  return "";
};

export const validateEmail = (value: string, required = true): string => {
  const clean = normalize(value).toLowerCase();
  if (!clean) return required ? "Email address is required." : "";
  if (clean.length > 120 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(clean)) return "Enter a valid email address.";
  const [local, domain] = clean.split("@");
  if (!local || !domain) return "Enter a valid email address.";
  if (DISPOSABLE_DOMAINS.has(domain)) return "Temporary email addresses are not accepted.";
  const localWords = local.split(/[._+-]/).filter(Boolean);
  if (localWords.some((word) => DUMMY_WORDS.has(word)) || /^(?:123456|abcdef|qwerty)/i.test(local)) {
    return "Enter an email address you actively use.";
  }
  return "";
};

export const normalizeIndianPhone = (value: string): string => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
};

export const validatePhone = (value: string, required = true, label = "Phone number"): string => {
  const clean = normalize(value);
  if (!clean) return required ? `${label} is required.` : "";
  const digits = normalizeIndianPhone(clean);
  if (!/^[6-9]\d{9}$/.test(digits)) return `Enter a valid 10-digit Indian ${label.toLowerCase()}.`;
  if (/^(.)\1{9}$/.test(digits)) return `${label} cannot use the same digit repeatedly.`;
  if (["1234567890", "9876543210", "0123456789"].includes(digits)) return `Enter a genuine ${label.toLowerCase()}.`;
  return "";
};

export const validatePlainText = (
  value: string,
  label: string,
  options: { required?: boolean; min?: number; max?: number } = {},
): string => {
  const { required = true, min = 2, max = 100 } = options;
  const clean = normalize(value);
  if (!clean) return required ? `${label} is required.` : "";
  if (clean.length < min || clean.length > max) return `${label} must be between ${min} and ${max} characters.`;
  if (containsDummyText(clean)) return `Enter a genuine ${label.toLowerCase()}.`;
  const compact = clean.replace(/\s+/g, "");
  if (/^\d+$/u.test(compact) || /^\p{L}{2,}\d{3,}$/u.test(compact) || /^\d{3,}\p{L}{2,}$/u.test(compact)) {
    return `Enter a genuine ${label.toLowerCase()}.`;
  }
  if (!/[\p{L}\p{N}]/u.test(clean)) return `Enter a valid ${label.toLowerCase()}.`;
  return "";
};

export const validateSkId = (value: string, allowTestIds: boolean): string => {
  const clean = normalize(value).toUpperCase();
  if (!clean) return "SK Tech ID is required.";
  const production = /^SK\s?\d{1,12}$/.test(clean);
  const demo = allowTestIds && /^TEST-SK\d{1,12}$/.test(clean);
  return production || demo ? "" : "Enter a valid SK Tech ID, for example SK1234.";
};

export const validateBookingReference = (value: string): string => {
  const clean = normalize(value).toUpperCase();
  if (!clean) return "Booking reference is required.";
  if (!/^BR-[A-Z0-9_-]{20,30}$/.test(clean)) return "Enter the booking reference exactly as shown in your email.";
  return "";
};

export const validateManageToken = (value: string): string => {
  const clean = normalize(value);
  if (!clean) return "Manage token is required.";
  if (!/^BM-[A-Za-z0-9]{50,80}$/.test(clean)) return "Enter the complete manage token from your email.";
  return "";
};

export const validateOtp = (value: string): string => (/^\d{6}$/.test(normalize(value)) ? "" : "Enter the 6-digit verification code.");

export const validateRequiredSelect = (value: string, label: string): string =>
  normalize(value) ? "" : `${label} is required.`;

export const valueOf = (form: FormData, field: string): string => normalize(form.get(field));

export const sanitizedText = (value: string): string => normalize(value);

