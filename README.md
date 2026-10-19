# SK Tech Website v2

This repository is the isolated rebuild of the SK Tech public website and candidate/interview workflow. It does not depend on Google Forms and does not modify the existing production repository or Google Sheets.

It also includes the public, no-login Interview Dashboard requested to match the live experience: summary counts, All Upcoming/Today/Tomorrow/Available Slots/Job Openings views, the exact `ID / Round / Date / From / To / Batch` schedule columns, conflict and panel/weekend states, job filtering, and a four-step interview-booking modal. The page uses the official SK Tech logo and brand colours while keeping candidate and HR PII out of the public dashboard response.

## Project guides

- [Current real-flow status and latest ID format](docs/REAL_FLOW_STATUS.md)
- [End-to-end architecture and flow diagrams](docs/ARCHITECTURE.md)
- [Exact live registration and interview field parity](docs/LIVE_FIELD_PARITY.md)
- [Verification evidence, requirement status, and remaining blockers](docs/VERIFICATION.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)

## Environments

- **Local and staging:** test data only, `TEST-SK` candidate identifiers, allow-listed email recipients, and a separate Google Sheet.
- **Production:** disabled until the website passes acceptance testing and the owner explicitly approves legacy-data migration and cutover.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Keep `VITE_DEMO_MODE=true` until a new staging Apps Script deployment exists.
3. Run `npm install` and `npm run dev`.

Local pages:

- Main website and registration: `http://127.0.0.1:4173/`
- Public Interview Dashboard: `http://127.0.0.1:4173/interviews.html`

## Quality gates

```text
npm run check
npm --prefix apps-script test
npm run scan:external-forms
npm run workbook:build
npm run apps-script:bundle
```

The external-form scan fails if a Google Forms URL is introduced into the website source.

## Isolated staging resources

- [New staging Google Sheet](https://docs.google.com/spreadsheets/d/1wuXvUl6fGlV0Y4KnC5LW5edkh5-ECgJUbwkNnzUxa4Q/edit)
- [New private staging upload folder](https://drive.google.com/drive/folders/1hCw6Ri8Xq9j1UnJLodX5FmK32W51qhdO)
- [New Sheet-bound staging Apps Script project](https://script.google.com/home/projects/1F4zkXfBDVGZ98WVLHwaobX538v6p1Lbfp0mF6ESfbxDXFtKPVBHS4CZE/edit)

The verified Apps Script bundle is uploaded to the new Sheet-bound project and its staging Sheet/folder IDs are configured. Owner OAuth approval, web deployment, real Sheet/email end-to-end testing, live dashboard integration testing, and the new GitHub remote are still pending. Current evidence and exact completion steps are recorded in [the verification report](docs/VERIFICATION.md).

## Backend

The new Apps Script source lives in `apps-script/`. Its deployment must use the new staging workbook only. Do not configure it with any legacy spreadsheet ID. The anonymous public API returns only privacy-minimized dashboard fields; full candidate/HR details and block administration stay in the private Sheet. The easy admin sidebar is a separate bound-Sheet interface for authorized staff and is not part of the public Interview Dashboard.

## Data migration

No legacy data is copied during development. Migration is a separate, owner-approved phase after staging acceptance.
