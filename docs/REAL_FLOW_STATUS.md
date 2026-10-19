# Real flow verification — 19 October 2026

## Current result

Real end-to-end verification is **incomplete**. No real registration, booking,
reschedule, or email delivery has been proven. The preview still uses demo API
responses and now explicitly identifies the Interview Dashboard as a demo preview.
Owner Google permission approval has already been given in this chat. The active
tool session currently has no browser-control connection or Apps Script execution
connector, and no deployed staging `/exec` URL has been captured.

## Verified against the real staging Sheet

- `Candidates` and `_Email_Log` contain headers but no recorded business flows.
- The candidate sequence is now prefix `SK`, next value `1`, padding `0`.
  Newly allocated IDs will be `SK1`, `SK2`, `SK3`, etc.
- The exact authorized test recipient `siva92396@gmail.com` is allowlisted.
- Misplaced dropdown validations were found and removed from request fingerprints,
  provider messages, college names and HR emails. Status rules were applied to
  their actual schema columns and read back successfully.
- Existing production data has not been read, merged or modified. Staging IDs
  must not be merged with legacy IDs without a later migration mapping.

## Source updates awaiting Apps Script upload/deployment

- Branded emails with the official inline logo; effective sender account must be
  `support@mysktech.com`.
- Candidate sequence defaults and backend booking validation accept `SK1`.
- Dashboard availability shows the next five working days (weekends skipped).
- Official logo replaces the drawn mark in the main header/footer and favicons.

## Required real acceptance evidence

1. Deploy the latest `artifacts/apps-script-deploy/Backend.txt`, HTML files and
   manifest in the existing new Sheet-bound staging project; authorize as support.
2. Initialize the recognized skeleton and install the queue trigger; capture `/exec`.
3. Connect the new frontend to `/exec`, disable demo mode and verify API health.
4. Request and verify a real OTP at the authorized test recipient.
5. Register via the website; read back the saved candidate, allocated ID and sent email.
6. Book via the dashboard; verify the row, history, slot occupancy and delivered email.
7. Book another non-overlapping same-day interview for the same candidate.
8. Verify capacity/conflict rejection and no duplicate write on request replay.
9. Reschedule through the emailed link; verify prior/new rows, history and delivered email.
10. Add a panel/time block, refresh, and attempt a stale-slot booking.
11. Verify weekend closure and five working days of availability.
12. Confirm public responses and analytics exclude private candidate/HR data.

Automated checks and manually inserted Sheet rows are not substitutes for these
website-to-backend-to-Sheet-to-email checks.
