# Real staging acceptance — 19 October 2026

## Status

Core flows are connected and verified with actual staging writes, not demo responses.
This is **not a completed public launch**. Remaining limits are listed below.

- Connected local website: http://127.0.0.1:4174/
- Interview dashboard: http://127.0.0.1:4174/interviews.html
- Port 4173 is the older demo process; use 4174 for connected acceptance.
- Backend deployment version 5, executing as support@mysktech.com.
- Staging spreadsheet: `1wuXvUl6fGlV0Y4KnC5LW5edkh5-ECgJUbwkNnzUxa4Q`.
- Backend script: `1F4zkXfBDVGZ98WVLHwaobX538v6p1Lbfp0mF6ESfbxDXFtKPVBHS4CZE`.
- Sheet admin container: `1GdAskoMRJmJI9xMZrMSEzJFtncexXoztwb5HC2deWydfsemd3Ji4J-nk`.

## Actual end-to-end evidence

| Flow | Observed result |
| --- | --- |
| Backend health | Anonymous staging API reports configured/healthy |
| Registration | Website submitted fictional staging candidate; Candidates row 2 allocated SK1 |
| Registration email | Queue/log records Google MailApp accepted registration message to authorized test recipient |
| Booking | Website saved TEST-BK-000001, 20 October 09:00–09:30, panel 1 |
| Reschedule | Website changed it to 10:00–10:30; old row RESCHEDULED, replacement TEST-BK-000002 SCHEDULED with preserved lineage |
| Multiple same-day interviews | Real API saved TEST-BK-000003 at 11:00–11:30 for SK1 on the same day |
| Request retry | Identical request ID returned same operation; Sheet retained only expected three booking rows |
| Conflict rejection | Real API rejected occupied panel/time with SLOT_UNAVAILABLE |
| Weekend rejection | Saturday booking rejected; Saturday availability returned weekendClosed and no slots |
| Dummy fields | Real API rejected shiva123 and 123456 with VALIDATION_FAILED |
| Dashboard | Browser displayed two upcoming SK1 interviews, official logo and five working dates |
| Admin blocking | Sheet sidebar saved temporary all-panel block, 21 October 15:00–15:30 |
| Blocking enforcement | Live API returned 34 slots, zero at 15:00 while block was active |
| Unblocking | Sidebar disabled test rule; API restored 36 slots including both panels at 15:00 |
| Admin access | Sheet SK Tech Admin menu opens sidebar; active/inactive changes verified |

Registration and first booking/reschedule used the actual website. Negative cases
and second same-day booking used the actual deployed HTTP endpoint. OTP codes were
read from the authorized staging queue to exercise verification; recipient inbox
receipt was NOT independently verified.

Email log entries EML1–EML7 cover OTP, registration, booking and reschedule. All
reached SENT (MailApp accepted), to siva92396@gmail.com. Trigger executes every
minute as support@mysktech.com. Initial OTP attempt retried after a transient
provider exception; subsequent delivery succeeded. SENT does not prove inbox
delivery or spam placement. Branded HTML includes official inline logo.

## Defects found by real checks and corrected

- Typed Sheet times normalized to canonical HH:mm.
- Typed date columns read from raw Date values using workbook timezone, not
  ambiguous localized display strings. Real block enforcement retested after fix.
- Unavailable-slot requests no longer consume the verified booking token.
- Anonymous execute-as-owner calls cannot inherit owner's admin identity.
- Admin container uses pinned shared backend library for same configuration/lock.

## Local verification

- Frontend: 8 tests passed; production TypeScript/Vite build passed.
- Backend: 34 tests passed, including typed dates/times and admin auth regression.
- External Google Forms scan passed.
- These supplement, not replace, actual flow evidence above.

## Remaining launch gates — not claimed complete

1. GitHub/public hosting: browser is signed out; isolated local repo has no remote.
   No public frontend URL exists yet.
2. Real document upload and attachment-to-registration remain unverified.
   Registration omitted optional documents. Authorized test address exhausted
   three OTPs/hour; security limits were not bypassed to manufacture a pass.
3. Inbox delivery and visual rendering require test inbox access; current mail
   connection is the sender account only.
4. Production needs public origin/URL, real panels/jobs, spam protection review,
   and staging-specific analytics measurement. Current GA4 configuration came
   from live site; local tests declined consent. GA4 ingestion not verified.
5. Weekend special-open override and every admin rule variant have automated
   coverage but were not all exercised as real writes.

No legacy production files, repositories or records were modified or merged.
Staging SK1 is test data: do not merge directly with legacy SK1. Plan legacy import
and next production sequence only after acceptance, as requested.
