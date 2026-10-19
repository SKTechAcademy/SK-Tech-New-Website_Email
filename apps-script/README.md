# SK Tech website v2 — staging Apps Script backend

This folder contains the isolated Google Apps Script backend for the new website. It is intentionally configured for a **new staging workbook only**:

- candidate IDs start with `TEST-SK`
- booking IDs start with `TEST-BK-`
- no old workbook is read, copied, merged or modified
- no candidate login is required
- registration and booking require short-lived email verification
- Saturday and Sunday are closed unless an administrator adds a special-open rule

Nothing in this folder deploys itself. Creating the Google Sheet, binding this script, authorizing it and deploying the web app are separate, explicit staging steps.

## Runtime design

The public site calls one Apps Script web-app URL. `Code.gs` routes requests by the `action` field. All writes use `LockService.getScriptLock()` and a client-generated `requestId`.

A request ID is an idempotency key, not a business duplicate key:

- repeating the same request ID with the same payload replays the safe original response
- repeating that ID with changed data is rejected
- a different request ID always represents a new intentional request
- candidate, company, round, date and time are never used to declare a duplicate
- one candidate may have multiple interviews on one day
- panel capacity and active availability rules still apply

Rescheduling creates a new booking row and links it to the previous booking. The previous row is marked `RESCHEDULED`, and an append-only event is added to `Booking_History`. An identical replacement schedule is valid because the old booking is excluded from the capacity check.

## Staging workbook tabs

`initializeStagingWorkbook('CREATE NEW STAGING')` creates or verifies these tables:

| Tab | Purpose |
| --- | --- |
| `Settings` | Non-secret application settings |
| `Candidates` | Private candidate records and generated test SK IDs |
| `Interview_Bookings` | Current and prior booking versions |
| `Booking_History` | Append-only booking events |
| `Panels` | Active panels, hours, weekdays and capacity |
| `Slot_Blocks` | All-panel or one-panel blocks, including date ranges and all-day blocks |
| `Special_Open_Dates` | Explicit weekend/special opening windows |
| `Jobs` | Public-safe active job fields |
| `Reference_Data` | Public option lists |
| `_Sequences` | Locked ID counters |
| `_Email_Queue` | Private email recipients and template payloads |
| `_Email_Log` | Hashed-recipient delivery ledger |
| `_Otp_Challenges` | Hashed OTP challenges and one-time token state |
| `_Upload_Sessions` | Expiring, one-use references to private candidate document uploads |
| `_Request_Log` | Idempotency, operation and email status ledger |
| `_Audit_Log` | Administrative and public-write audit events |

Tabs whose names begin with `_` are hidden by setup. Hidden is not an access-control boundary; restrict workbook editors to trusted staff.

## Safe staging setup

1. Create a brand-new blank Google Sheet with `STAGING` clearly in its name. Do not use an existing operations workbook.
2. Create a container-bound Apps Script project from that new Sheet.
3. Add the `.gs`, `.html` and `appsscript.json` files from this directory. If using `clasp`, create its local project binding inside this directory; never point it at an old script ID.
4. Reload the Sheet, open **SK Tech Staging**, and choose **Initialize blank staging workbook**.
5. Type the exact phrase `CREATE NEW STAGING`. Initialization refuses an unrelated populated workbook. A pre-created skeleton is accepted only when every non-Control tab name and header exactly matches `Schema.gs`.
6. In `Settings`, configure at least:
   - `WEBSITE_BASE_URL` — staging website URL
   - `ALLOWED_WEB_ORIGINS` — exact comma-separated staging origins; include protocol and no path
   - `STAGING_EMAIL_ALLOWLIST` and/or `STAGING_EMAIL_ALLOWED_DOMAINS` — test recipients only
   - `BOOKING_NOTIFICATION_TO` — optional internal notification recipients
   - `ADMIN_ALLOWLIST` or `ADMIN_DOMAIN` — recommended for the bound admin sidebar
   - `GA4_MEASUREMENT_ID` — public GA4 ID used by the frontend; never put PII in analytics events
7. Use **Install email queue trigger**. The trigger is the only automatic mail worker.
8. Deploy as a web app, execute as the deployment owner, and allow anonymous access. Use a dedicated organization-owned deployment account with the minimum workbook access needed.
9. Put the resulting `/exec` URL in the staging frontend only.
10. Run `runBackendSelfTests()` and the readiness menu before testing public flows.

The exact Settings rows expected by this backend are below. Setup writes all five columns: `key`, `value`, `valueType`, `description`, and `editable`.

| Key | Staging default | Type |
| --- | --- | --- |
| `ENVIRONMENT` | `STAGING` | `string` |
| `TIME_ZONE` | `Asia/Kolkata` | `string` |
| `WEEKEND_DAYS` | `SAT,SUN` | `csv` |
| `DEFAULT_SLOT_MINUTES` | `30` | `integer` |
| `BOOKING_WINDOW_DAYS` | `14` | `integer` |
| `BOOKING_LEAD_MINUTES` | `120` | `integer` |
| `OTP_TTL_MINUTES` | `10` | `integer` |
| `OTP_MAX_ATTEMPTS` | `5` | `integer` |
| `EMAIL_MAX_ATTEMPTS` | `5` | `integer` |
| `STAGING_EMAIL_ALLOWLIST` | blank | `csv` |
| `STAGING_EMAIL_ALLOWED_DOMAINS` | `mysktech.com` | `csv` |
| `REGISTRATION_EMAIL_ENABLED` | `TRUE` | `boolean` |
| `BOOKING_EMAIL_ENABLED` | `TRUE` | `boolean` |
| `RESCHEDULE_EMAIL_ENABLED` | `TRUE` | `boolean` |
| `SUPPORT_EMAIL` | `support@mysktech.com` | `string` |
| `BOOKING_NOTIFICATION_TO` | blank | `csv` |
| `ADMIN_ALLOWLIST` | blank | `csv` |
| `ADMIN_DOMAIN` | blank | `string` |
| `GA4_MEASUREMENT_ID` | blank until configured | `string` |
| `WEBSITE_BASE_URL` | blank until configured | `string` |
| `ALLOWED_WEB_ORIGINS` | blank until configured | `csv` |
| `CONSENT_VERSION` | `candidate-contact-v1` | `string` |
| `TURNSTILE_ENABLED` | `FALSE` | `boolean` |

In STAGING, the email worker never calls `MailApp` for an address outside the exact-email/domain restrictions. It records that row as `SUPPRESSED`. The OTP endpoint rejects such an address before queueing so a tester receives an immediate, safe error. Production does not apply the staging recipient restriction.

Secrets belong in Apps Script **Script Properties**, never in `Settings`:

| Property | Required | Purpose |
| --- | --- | --- |
| `SPREADSHEET_ID` | automatic | ID of this new staging workbook |
| `HASH_SECRET` | automatic | HMAC secret for tokens, fingerprints and hashes |
| `TURNSTILE_SECRET` | when enabled | Cloudflare Turnstile server secret |
| `TURNSTILE_SITE_KEY` | when enabled | Public Turnstile site key returned by config |

Set `TURNSTILE_ENABLED=TRUE` only after both Turnstile properties are configured for the staging origin.

## API envelope

Successful response:

```json
{
  "ok": true,
  "code": "BOOKING_CONFIRMED",
  "data": {},
  "requestId": "client-generated-128-bit-id",
  "timestamp": "2026-10-19T12:00:00.000Z"
}
```

Validation or application error:

```json
{
  "ok": false,
  "code": "VALIDATION_FAILED",
  "message": "Please correct the highlighted fields.",
  "fieldErrors": { "fullName": "Use letters only." },
  "requestId": "client-generated-128-bit-id",
  "timestamp": "2026-10-19T12:00:00.000Z"
}
```

Apps Script Content Service returns HTTP 200 for application errors; clients must inspect `ok` and `code`.

## Read actions

Read actions use `GET WEB_APP_URL?action=...`. They return no candidate PII.

| Action | Parameters | Safe data |
| --- | --- | --- |
| `health` | none | version, environment and configured state |
| `config` | none | time zone, booking window, GA4 ID, Turnstile public state |
| `referenceData` | none | active public option values and labels |
| `interviewDashboard` (alias `dashboard`) | `durationMinutes`, `slotDays`, `interviewLimit`, `jobLimit` | privacy-minimized counts, six-column interview rows, availability states/slots and active jobs |
| `jobs` | `page`, `pageSize`, `q`, `type` | active public job fields; only HTTPS apply links |
| `availability` | `date=YYYY-MM-DD`, `durationMinutes` | panel labels, times and remaining capacity |
| `operationStatus` | `token=OP-...` | confirmation and aggregate email state only |

Add a valid `callback` parameter for JSONP when a browser cannot read a normal cross-origin GET. JSONP is supported only for these read actions.

## Write actions

Send writes as `POST` with `Content-Type: text/plain;charset=utf-8` and a JSON body. This is a CORS-simple request and avoids a browser preflight.

### 1. Request email verification

```json
{
  "action": "requestEmailVerification",
  "requestId": "dce1e73f8f5e4a3da7068fbb4b298dcc",
  "email": "candidate@example.org",
  "purpose": "REGISTRATION",
  "hp": "",
  "turnstileToken": "optional-when-enabled"
}
```

Use purpose `BOOKING` before a booking. Response data contains `verificationId`, expiry and `emailQueued`. The six-digit code is sent through the private queue and never written to a response or Sheet in plaintext.

### 2. Verify email

```json
{
  "action": "verifyEmail",
  "requestId": "a-new-id-for-this-attempt",
  "verificationId": "VRF-...",
  "email": "candidate@example.org",
  "code": "123456"
}
```

Response data contains a short-lived, one-use `verificationToken`.

### 3. Register candidate

```json
{
  "action": "registerCandidate",
  "requestId": "a-new-registration-id",
  "verificationToken": "VT-...",
  "hp": "",
  "candidate": {
    "fullName": "Asha Reddy",
    "email": "asha.reddy@mysktech.com",
    "emailId": "asha.reddy@mysktech.com",
    "mobileNumber": "9741258360",
    "whatsappNumber": "8867412953",
    "gender": "Female",
    "education": "B.tech",
    "passoutYear": "2024",
    "collegeName": "Bangalore Institute of Technology",
    "experienceLevel": "2 Year",
    "currentAddress": "Indiranagar, Bengaluru, Karnataka",
    "currentCompany": "Infosys Limited",
    "currentCtc": "6.5 LPA",
    "expectedCtc": "9 LPA",
    "noticePeriod": "30 Days",
    "source": "WEBSITE",
    "consent": true
  }
}
```

The response intentionally does not disclose the generated SK ID. The candidate receives the test SK ID in the registration email. The public response contains an opaque operation token and email queue status.

### 4. Book interview

```json
{
  "action": "bookInterview",
  "requestId": "a-new-booking-id",
  "verificationToken": "VT-...",
  "hp": "",
  "booking": {
    "skId": "TEST-SK0001",
    "email": "asha.reddy@mysktech.com",
    "fullName": "Asha Reddy",
    "batch": "2",
    "panelId": "PANEL-A",
    "date": "2026-10-26",
    "startTime": "10:00",
    "endTime": "10:30",
    "round": "Round 1",
    "technology": "Java",
    "company": "Infosys Limited",
    "hrName": "Priya Sharma",
    "hrPhone": "9128473650",
    "hrEmail": "priya.sharma@infosys.com"
  }
}
```

The `skId`, `email`, and `fullName` must identify the same registered candidate. The `panelId`, date, and times must be selected from a current `availability` response. The backend rechecks panel capacity and active blocks while holding the write lock. Booking and internal notification emails are queued only after the booking row and history event are saved.

### 5. Private capability lookup

```json
{
  "action": "bookingLookup",
  "requestId": "lookup-correlation-id",
  "publicReference": "BR-...",
  "manageToken": "BM-..."
}
```

The manage token is delivered in the candidate email. The response omits candidate name, email, phone and HR contact data.

### 6. Reschedule

```json
{
  "action": "rescheduleInterview",
  "requestId": "a-new-reschedule-id",
  "publicReference": "BR-...",
  "manageToken": "BM-...",
  "hp": "",
  "reason": "Candidate requested a later time",
  "newSchedule": {
    "panelId": "PANEL-A",
    "date": "2026-10-27",
    "startTime": "11:00",
    "endTime": "11:30"
  }
}
```

The response contains no new management token. The new link is sent to the verified candidate address.

## Browser CORS constraint and iframe fallback

Apps Script does not provide an API for setting arbitrary CORS response headers. First try the simple `text/plain` fetch and follow redirects. Never use `mode: "no-cors"`; it hides the response and cannot safely complete verification.

If the deployed environment blocks reading the response, use the included form/iframe bridge:

1. Add the exact frontend origin to `ALLOWED_WEB_ORIGINS`, such as `https://staging.example.com`. Paths and wildcards are not accepted.
2. Create a hidden iframe with a unique `name`.
3. Create a form with `method=POST`, `action=WEB_APP_URL`, and `target` equal to that iframe name.
4. Add form field `transport=iframe`.
5. Add form field `payload` containing the normal JSON payload plus:
   - `replyOrigin`: `window.location.origin`
   - `nonce`: a fresh, unpredictable 16–100 character value
6. Listen for `message` and accept it only when all are true:
   - `event.origin` is the Apps Script response origin observed for the deployed web app
   - `event.data.source === "sk-tech-api"`
   - `event.data.nonce` exactly matches the pending request
7. Read the normal API envelope from `event.data.payload`, then remove the form, iframe and listener.

The bridge response calls `postMessage` only to an exact server-side allowlisted origin. Never put the OTP or a management token in a URL query string sent to analytics.

## Admin slot and panel blocking

Open the staging Sheet and choose **SK Tech Staging → Open availability controls**.

An authorized workbook editor can:

- block all panels for a time window or full day
- block one panel for a slot, day or date range
- create a special opening for all panels or one panel
- disable and re-enable a rule without deleting history

Saved block scopes use the workbook contract exactly: `PANEL_SLOT`, `PANEL_DAY`, `GLOBAL_SLOT`, `GLOBAL_DAY`, or `DATE_RANGE`.

The public availability response omits blocked options. Booking and rescheduling perform the same check again under the lock, so an old browser page cannot book a slot that was blocked after it loaded.

The sidebar is private because it is container-bound to the restricted Sheet. Configure `ADMIN_ALLOWLIST` or `ADMIN_DOMAIN` as an additional identity check. Do not expose admin functions through `doGet` or `doPost`.

## Email reliability

Registration, booking and rescheduling each enqueue candidate mail. Booking and rescheduling optionally enqueue internal messages. `processEmailQueue` retries known send failures with backoff and records every attempt.

The worker uses an `ATTEMPTING` state before calling `MailApp`. If execution stops after Google may have accepted a message but before `SENT` is recorded, the stale attempt becomes `UNKNOWN` and is not automatically duplicated. An administrator must review that rare state before manually retrying. Staging recipients outside the configured test list become `SUPPRESSED` and are never sent.

`SUPPORT_EMAIL` is the reply-to address. The visible From address is the Google account that owns the deployment because `MailApp` cannot impersonate an arbitrary address. Deploy from the authorized `support@mysktech.com` account if that must be the From address.

## Validation and security

Both browser and server validation are required. The backend independently rejects:

- names containing digits, placeholder words or repeated junk characters
- short, sequential or repeated phone numbers
- malformed and common disposable/test email addresses
- placeholder company, technology, round, batch and city values
- invalid dates, times, durations, panel IDs and expired verification tokens
- spreadsheet-formula injection in every appended string

Additional controls include HMAC-hashed tokens, short OTP expiry, attempt limits, email/global throttles, optional Turnstile, capability tokens for booking management, exact iframe-origin allowlisting, private audit logs and no PII in public list/status responses.

This is an anonymous public intake API, not an authenticated staff system. Google Sheets and Apps Script quotas make it suitable for the expected academy workload, not high-volume transactional traffic.

## Local verification

Requires Node.js 18 or newer:

```powershell
cd apps-script
npm test
```

The tests cover dummy-data rejection, realistic data acceptance, weekend calculation, slot overlap, formula injection, endpoint presence, schema ledgers, reschedule versioning, the absence of business-field deduplication, queued-email recovery and the cross-origin fallback contract.

For Apps Script runtime verification, run `runBackendSelfTests()` from the editor. Then test end to end with test addresses only:

1. request and receive OTP
2. verify email
3. register and receive `TEST-SK...`
4. book and receive booking email
5. create an identical-detail second booking on available capacity and confirm it is not treated as a duplicate
6. reschedule to the same schedule and confirm a new version/history event
7. block a panel slot and confirm it disappears and cannot be submitted from a stale page
8. confirm Saturday/Sunday are empty, then add a special opening and confirm only that window appears
9. verify `_Email_Log`, `_Request_Log`, `Booking_History` and `_Audit_Log`
10. confirm analytics contains events but no names, emails, phones, SK IDs, booking IDs, OTPs or tokens

## Production cutover — deliberately not performed now

Do not import old data or change the test prefixes during staging. After the full website is approved, migration is a separate operation:

1. pause old registration briefly
2. copy and validate old records without changing their IDs
3. resolve migration conflicts explicitly
4. set the candidate sequence above the verified highest old numeric SK ID
5. replace test prefixes only in an approved production workbook/configuration
6. run one controlled registration and booking
7. activate the production site only after row, email and analytics evidence passes

Never run the old and new production ID generators concurrently.
