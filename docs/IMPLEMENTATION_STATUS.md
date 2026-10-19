# Implementation status

## Guardrails

- Existing website files and repositories remain read-only.
- Existing Google Sheets remain read-only and are not migration sources during this phase.
- Staging uses a separate workbook and `TEST-SK` identifiers.
- Production deployment, DNS changes, and legacy-data migration require explicit approval after acceptance testing.

## Acceptance areas

- Native candidate registration without Google Forms
- Automatic staging SK ID and registration email
- Native interview booking and rescheduling
- Multiple same-day and identical-detail interviews
- Weekend closure with date-specific special opening
- Panel, slot, full-day, and global blocking
- Client and server validation
- GA4 without personal information
- Responsive performance and accessibility
- Auditable email queue, delivery log, and booking history
