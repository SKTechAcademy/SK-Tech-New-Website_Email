# Live form field parity

This document records the business fields read from the current live SK Tech forms and how each is represented in the new native website. Google Forms is not embedded, linked, or used as storage.

## Candidate registration: 20 live fields

| # | Live field | New website field | Current behavior |
| ---: | --- | --- | --- |
| 1 | Email | `email` — **Email (for verification)** | Required; receives the OTP and SK ID email |
| 2 | Name | `fullName` — **Name** | Required; genuine-name validation |
| 3 | Mobile Number | `mobileNumber` — **Mobile number** | Required; realistic phone validation |
| 4 | WhatsApp Number | `whatsappNumber` — **WhatsApp number** | Required; realistic phone validation |
| 5 | Gender | `gender` — **Gender** | Required; `Male` or `Female` |
| 6 | Email ID | `emailId` — **Email ID** | Required; may match the verified email |
| 7 | Education | `education` — **Education** | Required; exact live options include lowercase `others` |
| 8 | Passout Year | `passoutYear` — **Passout year** | Required; live year options retained |
| 9 | College Name | `collegeName` — **College name** | Required; rejects placeholder/dummy text |
| 10 | Experience Level | `experienceLevel` — **Experience level** | Required; live options retained |
| 11 | Current Address | `currentAddress` — **Current address** | Required; rejects placeholder/dummy text |
| 12 | Current Company | `currentCompany` — **Current company** | Required; `Fresher` is accepted for an unemployed candidate |
| 13 | Current CTC | `currentCtc` — **Current CTC** | Required; accepts a real amount or `Fresher` |
| 14 | Expected CTC | `expectedCtc` — **Expected CTC** | Required; rejects placeholder/dummy text |
| 15 | Notice Period | `noticePeriod` — **Notice period** | Required; live options retained |
| 16 | Resume | `resume` — **Resume** | Optional secure file upload |
| 17 | Aadhar | `aadhar` — **Aadhar card** | Optional secure file upload |
| 18 | Current Company Offer Letter | `currentCompanyOfferLetter` — **Current Company Offer Letter** | Optional; up to five files |
| 19 | Relieving Letter | `relievingLetter` — **Relieving Letter** | Optional secure file upload |
| 20 | Experience Letter | `experienceLetter` — **Experience Letter** | Optional secure file upload |

Security/workflow controls added by the new website—verification code, consent checkbox, request ID, upload token, and spam honeypot—are not replacement business fields and are not included in the count of 20.

### Candidate option parity

- Gender: `Male`, `Female`
- Education: `B.tech`, `BE`, `MCA`, `BCA`, `MBA`, `M.tech`, `others`
- Passout year: `2026` through `2015` in descending order
- Experience level: `Fresher`, `1 Year`, `2 Year`, `3 Year`, `4 Year`, `5 Year`, `6 Year`, `7 Years`, `8 Years`, `9 Years`, `10 Years`, `Others`
- Notice period: `Immediate Joiner`, `15 Days`, `30 Days`, `60 Days`, `Serving Notice Period`

## Interview booking: 14 live fields

| # | Live field | New website field | Current behavior |
| ---: | --- | --- | --- |
| 1 | Email | `email` — **Email** | Required; verified before booking |
| 2 | SK Tech Register ID | `skId` — **SK ID** | Required; matched to the candidate record |
| 3 | Full Name | `fullName` — **Full name** | Required; genuine-name validation |
| 4 | Batch | `batch` — **Batch** | Required; live values 1–4 |
| 5 | Round | `round` — **Round** | Required; live options retained |
| 6 | Technology | `technology` — **Technology** | Required; live options retained |
| 7 | Other technology | `technologyOther` — **Other technology** | Required only when Technology is `Other` |
| 8 | Interview Company | `company` — **Company** | Required; rejects placeholder/dummy text |
| 9 | HR Name | `hrName` — **HR name** | Required; genuine-name validation |
| 10 | HR Number | `hrPhone` — **HR number** | Required; realistic phone validation |
| 11 | HR Mail ID | `hrEmail` — **HR mail ID** | Required; email validation |
| 12 | Interview Date | `date` — **Interview date** | Required; selected before checking availability |
| 13 | From | `startTime` | Required; populated by the selected live slot |
| 14 | To | `endTime` | Required; populated by the selected live slot |

The new UI does not ask candidates to type `From` and `To` freehand. A candidate chooses a date and duration, then selects an available panel/time. That safer selection writes the same date/from/to business values while preventing invalid, full, or admin-blocked times. `panelId` and duration are operational controls added by the new system and are not counted among the 14 live fields.

### Interview option parity

- Batch: `1`, `2`, `3`, `4`
- Round: `Assessment`, `AI Assessment`, `Round 1`, `Round 2`, `Round 3`, `Round 4`, `Reschedule Round 1`, `Reschedule Round 2`, `Reschedule Round 3`, `Reschedule Round 4`, `HR Manager Round`, `AI Interview`, `Interview Supporter not available`
- Technology: `QA Engineer`, `Data Engineer`, `Full Stack Dot Net Developer`, `Java`, `Python`, `Interview Supporter not available`, `SAP`, `Other`

Email verification and the spam honeypot are new security controls and are not included in the count of 14.

## Repeat and reschedule behavior

Field similarity is never used as a duplicate key. A candidate may have:

- multiple interviews on the same date;
- two intentional bookings with the same company, round, technology, date, and time when capacity permits; and
- a rescheduled interview whose details happen to match a prior schedule.

Only a repeated technical submission carrying the exact same `requestId` is replay-protected. A reschedule preserves the original record and creates a linked new version plus a `Booking_History` event.

## Interview Dashboard parity

The Interview Dashboard is implemented as the public `interviews.html` page. It does not require a login and does not change the 20 registration / 14 booking field counts above.

### Exact live-style interview table

| # | Public column | New dashboard source | Privacy behavior |
| ---: | --- | --- | --- |
| 1 | ID | Candidate SK ID | The only candidate identifier shown; no name or contact details |
| 2 | Round | Interview round | Plain public schedule label |
| 3 | Date | Interview date | Rendered in Asia/Kolkata context |
| 4 | From | Start time | Public schedule value |
| 5 | To | End time | Public schedule value |
| 6 | Batch | Candidate batch | Public schedule value |

The page also matches the live dashboard interaction pattern with:

- summary counts for Upcoming Interviews, Today's Interviews, New Openings and Old Openings;
- views for All Upcoming, Today, Tomorrow, Available Slots and Job Openings;
- colour/state distinctions for today, tomorrow, next weekday, later weekdays, conflicts and panel/weekend unavailability;
- server-derived conflict detection, panel capacity, active blocks, weekend closures and special openings;
- active job cards with search, employment-type and new/old filters, sorting and pagination; and
- a four-step Schedule Interview modal: Candidate, Interview, HR contact, and Date & time.

The modal captures the same 14 interview business fields listed above. `From` and `To` still come from a validated available-slot selection rather than unsafe free-text input.

### Dashboard privacy boundary

The public interview rows do **not** return candidate name/email/phone, HR details, the booked interview's company, private booking IDs, booking-management tokens, request IDs, internal panel names or block reasons. Those values remain available only in the private staging Google Sheet and its separate authorized admin sidebar. Public job cards may show the employer name supplied for that active opening. The official SK Tech logo is served from the new site's local `public/sk-tech-logo.png` asset; no live-site dependency is required at runtime.
