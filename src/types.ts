export interface ApiEnvelope<T> {
  ok: boolean;
  code: string;
  data?: T;
  message?: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
  timestamp?: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  experience: string;
  skills: string[];
  salary?: string;
  applyUrl?: string;
  postedDate?: string;
}

export interface JobsResponse {
  items: Job[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicConfigResponse {
  environment: string;
  timezone: string;
  bookingHorizonDays: number;
  bookingLeadMinutes: number;
  weekendsClosed: boolean;
  emailVerificationRequired: boolean;
  candidateLoginRequired: boolean;
  ga4MeasurementId?: string;
  turnstileEnabled: boolean;
  turnstileSiteKey?: string;
}

export interface AvailabilitySlot {
  panelId: string;
  panelLabel: string;
  startTime: string;
  endTime: string;
  remainingCapacity: number;
}

export interface AvailabilityResponse {
  date: string;
  timezone: string;
  weekendClosed: boolean;
  specialOpen: boolean;
  slots: AvailabilitySlot[];
}

export interface VerificationRequestResponse {
  verificationId: string;
  expiresInSeconds: number;
  emailQueued: boolean;
}

export interface VerificationResponse {
  verificationToken: string;
  expiresInSeconds: number;
}

export interface OperationResponse {
  operationToken: string;
  status: string;
  emailQueued: boolean;
  publicReference?: string;
}

export interface BookingLookupResponse {
  publicReference: string;
  status: string;
  date: string;
  startTime: string;
  endTime: string;
  panelLabel: string;
  technology?: string;
  round?: string;
  company?: string;
  timezone?: string;
  version?: number;
}

export interface OperationStatusResponse {
  status: string;
  emailStatus: string;
}

export type DashboardCategory =
  | "today"
  | "tomorrow"
  | "next-weekday"
  | "later-weekday"
  | "conflict"
  | "unavailable";

/**
 * Deliberately restricted public interview shape. Candidate names, contact
 * details, HR details and private booking-management values never belong in
 * the dashboard response or DOM.
 */
export interface PublicDashboardInterview {
  id: string;
  round: string;
  date: string;
  startTime: string;
  endTime: string;
  batch: string;
  status: string;
  category: DashboardCategory;
}

export interface PublicDashboardSlot {
  date: string;
  panelId: string;
  panelLabel: string;
  startTime: string;
  endTime: string;
  remainingCapacity: number;
}

export interface InterviewDashboardCounts {
  upcoming: number;
  today: number;
  newOpenings: number;
  oldOpenings: number;
}

export interface InterviewDashboardResponse {
  generatedAt: string;
  timezone: string;
  counts: InterviewDashboardCounts;
  interviews: PublicDashboardInterview[];
  availableSlots: PublicDashboardSlot[];
}

