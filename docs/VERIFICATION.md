# Verification record

Verification snapshot: **19 October 2026 (Asia/Kolkata)**.

Legend: **PASS** = directly verified; **IMPLEMENTED / LIVE TEST PENDING** = present in source or staging data but not yet proven against a deployed Apps Script endpoint; **BLOCKED** = requires deployment/account action; **NOT STARTED** = intentionally deferred.

## Automated quality gates

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend unit tests | **PASS — 8/8** | `npm run test`; realistic/dummy registration and booking validation plus dashboard-contract cases pass |
| TypeScript + production bundle | **PASS** | `npm run build` completed during the implementation verification cycle |
| Combined frontend check | **PASS** | `npm run check` previously completed with tests, type check, and Vite build |
| Apps Script backend tests | **PASS — 31/31** | `npm --prefix apps-script test` rerun on 19 October; includes branded email rendering, capability privacy and HTML escaping |
| Public dashboard backend tests | **PASS — 4/4 dashboard cases** | Exact safe columns, date/job partitioning, same-day overlap conflicts, panel/weekend/block states, slot privacy and legacy unavailable-state classification |
| Google Forms/external-form guard | **PASS** | `npm run scan:external-forms` rerun on 19 October; “External form scan passed” |
| Apps Script syntax | **PASS — 16 `.gs` files plus combined bundle** | All backend files and the exact concatenated deployment artifact parsed successfully |
| Dependency audit | **PASS — 0 known vulnerabilities** | `npm audit` during the implementation verification cycle |

The 29 backend tests include weekend rules, special openings, panel/global block overlap, capacity, reschedule exclusion of the prior booking, same-candidate same-day bookings, staging mail restrictions, API actions, private ledgers, field/upload contract, absence of business-field deduplication, public registration-response SK ID protection, mail retry/unknown-state handling, iframe origin/nonce checks, dummy-data rejection, interval math, stable canonicalization, formula injection protection, HTML escaping, and the public dashboard contract. Dashboard tests verify the exact six public table values, exclude candidate/HR/private-interview-company/internal-panel data, distinguish valid same-day bookings from overlaps, classify panel/weekend blocks, and keep internal panel IDs and block reasons out of public availability data.

## Browser and responsive QA

The following were exercised against the local demo build in a real browser:

| Scenario | Result | Observed evidence |
| --- | --- | --- |
| Empty candidate submission | **PASS** | 16 validation errors shown; focus moved to Name |
| Obvious dummy text | **PASS** | `shiva123` / `123456` rejected in college, address, company, and CTC fields with genuine-data messages |
| Complete candidate registration | **PASS (demo)** | Six-digit demo OTP accepted and success panel displayed |
| Complete interview booking | **PASS (demo)** | Booking success displayed |
| Second same-candidate same-day booking | **PASS (demo)** | A second booking with matching details completed instead of being treated as a duplicate |
| Reschedule | **PASS (demo)** | Existing demo booking opened and replacement schedule completed |
| Weekend closure | **PASS (demo)** | Saturday 24 October 2026 returned the weekend-closed message and zero slots |
| Mobile layout | **PASS** | Tested at 390 × 844; no horizontal overflow and primary/mobile navigation remained usable |
| Google Forms references | **PASS** | DOM/source scan found no Google Forms link in the new website |
| Interview Dashboard implementation | **PASS locally / DEPLOYED API TEST PENDING** | Browser QA verified totals, all five views, the six-column schedule, available/booked/unavailable rows, jobs, OTP, all four booking steps and final demo save using the official logo |

Demo mode proves the frontend workflow and states. It does not prove a real Sheet write or email delivery; those remain in the deployment section below.

## Staging workbook verification

The new workbook is separate from legacy data:

- [SK Tech website v2 staging Google Sheet](https://docs.google.com/spreadsheets/d/1wuXvUl6fGlV0Y4KnC5LW5edkh5-ECgJUbwkNnzUxa4Q/edit)
- [Private staging upload folder](https://drive.google.com/drive/folders/1hCw6Ri8Xq9j1UnJLodX5FmK32W51qhdO)

Verified workbook facts:

| Item | Result |
| --- | --- |
| Workbook isolation | **PASS** — new Sheet ID; no legacy rows imported |
| Tabs | **PASS** — 17 tabs including `Control` and the 16 application tables |
| `Candidates` | **PASS** — exact 30-column schema |
| `Interview_Bookings` | **PASS** — exact 26-column schema |
| `Reference_Data` | **PASS** — header plus 63 configured option rows |
| `Settings` | **PASS** — header plus 23 runtime settings |
| `_Sequences` | **PASS** — exact header and 7 staging sequences |
| `_Upload_Sessions` | **PASS** — exact 14-column header |
| Private tabs | **PASS** — every `_` tab hidden |
| Data validation | **PASS** — status/type/scoped-rule dropdown validation applied |
| Visual review | **PASS** — `Control`, `Candidates`, and `Settings` previews reviewed for readable layout |
| Staging IDs | **PASS** — configured prefixes `TEST-SK` and `TEST-BK-` |

The upload folder exists and is isolated for staging. Real file upload via a deployed endpoint is still pending.

## Requirement-by-requirement status

| Requirement | Status | Notes |
| --- | --- | --- |
| No candidate login | **PASS** | Anonymous registration/booking UI; email verification provides ownership proof |
| Same live registration fields | **PASS** | 20/20 mapped in [LIVE_FIELD_PARITY.md](LIVE_FIELD_PARITY.md) |
| Same live interview fields | **PASS** | 14/14 mapped; date/from/to are captured through live slot selection |
| No Google Forms | **PASS** | Native forms plus external-form guard |
| Save to new Google Sheet | **IMPLEMENTED / LIVE TEST PENDING** | Backend append/lock logic and exact staging schema exist; deployed endpoint not yet available |
| Automatic SK ID | **IMPLEMENTED / LIVE TEST PENDING** | Locked `TEST-SK` sequence implemented; real registration proof pending |
| Registration email | **IMPLEMENTED / LIVE TEST PENDING** | Queue/template/retry logic implemented; real delivery pending |
| Booking email | **IMPLEMENTED / LIVE TEST PENDING** | Candidate email and optional staff notification implemented; real delivery pending |
| Reschedule email | **IMPLEMENTED / LIVE TEST PENDING** | Linked booking version and new secure email implemented; real delivery pending |
| Same-day multiple interviews | **PASS in tests and demo** | Business fields are not used as duplicate keys |
| Matching-details second interview | **PASS in tests and demo** | New request ID creates a new intentional booking when capacity permits |
| Weekend leave | **PASS in tests and demo** | Saturday/Sunday closed unless a special-open row exists |
| Easy panel/slot blocking | **IMPLEMENTED / LIVE TEST PENDING** | Rules and admin sidebar source exist; bound-Sheet launch and stale-page live rejection still need deployment QA |
| Strong dummy-data validation | **PASS** | Client and server validation covered by tests and browser QA |
| Google Analytics | **IMPLEMENTED / DEPLOYMENT CONFIG PENDING** | Consent, runtime GA4 ID, URL-fragment protection, and PII sanitizer exist |
| Fast/mobile-friendly website | **PASS locally** | Production Vite build and 390 × 844 browser check passed |
| Legacy merge | **NOT STARTED by instruction** | No legacy data copied; migration waits for full staging acceptance |
| Public Interview Dashboard | **PASS locally / LIVE API TEST PENDING** | `interviews.html` uses the official logo and exact ID/Round/Date/From/To/Batch columns, counts, date/slot/job filters, conflict and panel/weekend states, and a verified four-step demo booking modal; deployed Apps Script integration is pending |
| Dashboard privacy | **PASS in backend tests / LIVE INSPECTION PENDING** | Public contract excludes candidate/HR contact data, company, private booking IDs/tokens, internal panel names and block reasons |

## Deployment blockers and remaining acceptance tests

### 1. Apps Script deployment — **BLOCKED / PENDING**

A new staging Apps Script project exists:

- [SK Tech Website v2 – Staging Backend (Sheet-bound)](https://script.google.com/home/projects/1F4zkXfBDVGZ98WVLHwaobX538v6p1Lbfp0mF6ESfbxDXFtKPVBHS4CZE/edit)

The verified combined backend, admin sidebar, upload widget, and manifest are saved in this new Sheet-bound project. `SPREADSHEET_ID` and `UPLOADS_FOLDER_ID` point only to the new staging resources. Google owner authorization, the public `/exec` web-app URL, generated HMAC secret, and real email trigger are not yet available.

Before this blocker is marked complete:

1. Authorize the required Sheet, Drive, Mail, trigger, and account-email scopes with the owner account.
2. Initialize the recognized staging skeleton once to generate its private HMAC secret; never paste or expose that secret.
3. Configure the staging website origin, base URL, and GA4 measurement ID—never a legacy URL.
4. Run `runBackendSelfTests()` in Apps Script.
5. Install and verify the email queue trigger.
6. Deploy the web app to execute as the owner and allow anonymous candidate access.
7. Put only the new `/exec` URL in `VITE_API_URL` and disable demo mode.
8. Run a real allowed-domain OTP, registration, upload, booking, repeated booking, reschedule, block, special-open, stale-slot rejection, and email-log check.
9. Confirm no PII appears in GA4 network payloads or reports.

OAuth/Google permission prompts require the signed-in owner to review and approve the requested scopes.

### 2. GitHub remote — **BLOCKED / PENDING**

The work is in a new local Git repository, isolated from existing repositories. A new GitHub repository/remote has not been created because the browser session is not authenticated to GitHub and no authenticated GitHub repository-creation CLI is available.

Completion requires the owner to sign in to the intended `SKTechAcademy` GitHub account (or provide an already-created empty repository URL). Then the local branch can be committed, pushed, and checked for a clean working tree. No existing repository should be reused or modified.

### 3. Interview Dashboard deployment acceptance — **IMPLEMENTED / LIVE TEST PENDING**

The dashboard is intentionally a public, no-login page, matching the live site's operational schedule view. It is not the admin dashboard. Its source, exact six-column table, privacy-minimized backend contract, conflict rules, slot/block/weekend logic, job views and four-step booking modal are implemented. The private bound-Sheet sidebar remains the separate authorized administration surface.

Deployment acceptance must still confirm that the real endpoint:

1. returns the exact `ID / Round / Date / From / To / Batch` values without candidate or HR PII;
2. updates Upcoming/Today/New Openings/Old Openings counts and all five views;
3. marks candidate/panel overlaps as conflicts without marking valid non-overlapping same-day interviews;
4. reflects panel/global blocks, weekends, special openings and capacity changes after refresh;
5. supplies only genuinely bookable choices to the four-step modal; and
6. completes a verified booking, Sheet write and booking email from the dashboard.

## Email branding and test recipient — 19 October

The owner authorized staging mail to `siva92396@gmail.com` and requested sender `support@mysktech.com`. The new Sheet's exact staging recipient allowlist now includes that Gmail address. The official logo is stored privately in the staging upload folder as `sk-tech-email-logo.png`, and the mail code attaches it inline. The queue verifies the effective sending account is `support@mysktech.com` before attempting delivery. Branded OTP, registration, booking and reschedule templates plus local HTML previews are implemented and tested. This source update still needs uploading to Apps Script, owner authorization/deployment and real delivery verification. No real test message has yet been sent.

## Final acceptance evidence to capture

When the blockers are resolved, append the following evidence here:

- deployed staging website URL and Apps Script `/exec` URL;
- redacted `Candidates` row showing a newly generated `TEST-SK...` ID;
- redacted booking rows showing two intentional same-day bookings;
- redacted prior/new booking rows and `Booking_History` reschedule event;
- redacted `_Email_Log` rows for OTP, registration, booking, and reschedule;
- before/after availability response for panel/slot block and special weekend opening;
- GA4 debug evidence containing event names but no personal fields;
- GitHub repository URL, initial commit ID, branch name, and clean `git status`;
- deployed public Interview Dashboard response and browser screenshots showing counts, six-column schedule, slots, conflicts/blocks, jobs and the four-step modal;
- a redacted network/response capture confirming the dashboard contains no candidate/HR PII, private booking values, internal panel names or block reasons;
- confirmation that private administration remains accessible only through the authorized staging Sheet/sidebar.

Only after all real integration evidence passes should legacy migration planning begin.
