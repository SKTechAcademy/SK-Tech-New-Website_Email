import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("artifacts");
const previewDir = path.join(outputDir, "staging-workbook-previews");
const outputPath = path.join(outputDir, "SK-Tech-Website-v2-Staging.xlsx");

const workbook = Workbook.create();
const font = "Arial";
const headerFill = "#E8EAED";
const headerText = "#202124";
const border = "#DADCE0";
const inputFill = "#FFF7D6";
const excelDate = (isoDate) =>
  (Date.parse(`${isoDate}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
const excelDateTime = (isoDate, hour = 9) => excelDate(isoDate) + hour / 24;

const schemas = {
  Candidates: [
    "createdAt", "candidateId", "fullName", "email", "emailNormalized", "emailId",
    "emailIdNormalized", "mobileNumber", "whatsappNumber", "gender", "education",
    "passoutYear", "collegeName", "experienceLevel", "currentAddress", "currentCompany",
    "currentCtc", "expectedCtc", "noticePeriod", "resumeFileUrl", "aadharFileUrl",
    "offerLetterFileUrls", "relievingLetterFileUrl", "experienceLetterFileUrl", "source",
    "status", "verificationId", "requestId", "consentVersion", "createdBy",
  ],
  Interview_Bookings: [
    "createdAt", "bookingId", "publicReference", "candidateId", "candidateEmail",
    "candidateName", "batch", "panelId", "panelLabel", "date", "startTime", "endTime",
    "timezone", "round", "technology", "company", "hrName", "hrPhone", "hrEmail",
    "status", "previousBookingId", "rootBookingId", "manageTokenHash", "requestId",
    "version", "updatedAt",
  ],
  Booking_History: [
    "eventAt", "eventId", "bookingId", "rootBookingId", "eventType", "statusFrom",
    "statusTo", "actor", "requestId", "beforeJson", "afterJson", "reason",
  ],
  Panels: [
    "panelId", "publicLabel", "internalName", "active", "weekdays", "startTime",
    "endTime", "slotMinutes", "capacity", "effectiveFrom", "effectiveTo",
  ],
  Slot_Blocks: [
    "createdAt", "blockId", "scope", "panelId", "dateFrom", "dateTo", "startTime",
    "endTime", "reason", "active", "createdBy",
  ],
  Special_Open_Dates: [
    "createdAt", "overrideId", "panelId", "dateFrom", "dateTo", "startTime", "endTime",
    "reason", "active", "createdBy",
  ],
  Jobs: [
    "createdAt", "jobId", "company", "title", "experience", "location", "skills",
    "employmentType", "salary", "description", "applyUrl", "status", "postedDate",
    "updatedAt",
  ],
  Reference_Data: ["type", "value", "label", "active", "sortOrder"],
  Settings: ["key", "value", "valueType", "description", "editable"],
  _Sequences: ["name", "nextValue", "prefix", "padLength"],
  _Email_Queue: [
    "createdAt", "emailId", "template", "recipient", "subject", "payloadJson", "status",
    "attempts", "nextAttemptAt", "lastAttemptAt", "errorCode", "requestId",
    "operationToken", "sentAt",
  ],
  _Email_Log: [
    "eventAt", "emailId", "template", "recipientHash", "status", "providerMessage",
    "errorCode", "requestId",
  ],
  _Audit_Log: [
    "eventAt", "eventId", "action", "actor", "resourceType", "resourceId", "requestId",
    "outcome", "metadataJson",
  ],
  _Request_Log: [
    "createdAt", "requestId", "action", "fingerprint", "status", "operationToken",
    "resultCode", "resourceId", "safeResultJson", "emailStatus", "updatedAt", "errorCode",
  ],
  _Otp_Challenges: [
    "createdAt", "verificationId", "emailHash", "otpHash", "purpose", "expiresAt",
    "attempts", "maxAttempts", "status", "verifiedAt", "consumedAt", "tokenHash",
    "requestId",
  ],
  _Upload_Sessions: [
    "createdAt", "uploadId", "emailHash", "tokenHash", "status", "expiresAt",
    "folderId", "resumeFileId", "aadharFileId", "offerLetterFileIds",
    "relievingLetterFileId", "experienceLetterFileId", "consumedAt", "requestId",
  ],
};

const seedRows = {
  Panels: [
    ["PANEL-TEST-01", "Staging panel 1", "Staging panel 1", true, "MON,TUE,WED,THU,FRI", "09:00", "18:00", 30, 1, null, null],
    ["PANEL-TEST-02", "Staging panel 2", "Staging panel 2", true, "MON,TUE,WED,THU,FRI", "09:00", "18:00", 30, 1, null, null],
  ],
  Slot_Blocks: [
    [excelDateTime("2026-10-19"), "BLOCK-EXAMPLE-INACTIVE", "PANEL_SLOT", "PANEL-TEST-01", excelDate("2026-12-31"), excelDate("2026-12-31"), "10:00", "10:30", "Inactive example; safe to edit or remove", false, "staging-template"],
  ],
  Special_Open_Dates: [
    [excelDateTime("2026-10-19"), "OPEN-EXAMPLE-INACTIVE", "PANEL-TEST-01", excelDate("2026-12-26"), excelDate("2026-12-26"), "10:00", "13:00", "Inactive weekend-opening example", false, "staging-template"],
  ],
  Jobs: [
    [excelDateTime("2026-10-19"), "JOB-TEST-001", "Example company", "Example role", "0-2 years", "Bengaluru", "Testing", "Full-time", "Not disclosed", "Disabled staging example", "https://example.invalid/apply", "DRAFT", excelDate("2026-10-19"), excelDateTime("2026-10-19")],
  ],
  Reference_Data: [
    ...["QA Engineer", "Data Engineer", "Full Stack Dot Net Developer", "Java", "Python", "Interview Supporter not available", "SAP", "Other"]
      .map((value, index) => ["TECHNOLOGY", value, value, true, (index + 1) * 10]),
    ...["Assessment", "AI Assessment", "Round 1", "Round 2", "Round 3", "Round 4", "Reschedule Round 1", "Reschedule Round 2", "Reschedule Round 3", "Reschedule Round 4", "HR Manager Round", "AI Interview", "Interview Supporter not available"]
      .map((value, index) => ["INTERVIEW_ROUND", value, value, true, (index + 1) * 10]),
    ...["1", "2", "3", "4"].map((value, index) => ["BATCH", value, value, true, (index + 1) * 10]),
    ...["Male", "Female"].map((value, index) => ["GENDER", value, value, true, (index + 1) * 10]),
    ...["B.tech", "BE", "MCA", "BCA", "MBA", "M.tech", "others"].map((value, index) => ["EDUCATION", value, value, true, (index + 1) * 10]),
    ...["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015"]
      .map((value, index) => ["PASSOUT_YEAR", value, value, true, (index + 1) * 10]),
    ...["Fresher", "1 Year", "2 Year", "3 Year", "4 Year", "5 Year", "6 Year", "7 Years", "8 Years", "9 Years", "10 Years", "Others"]
      .map((value, index) => ["EXPERIENCE_LEVEL", value, value, true, (index + 1) * 10]),
    ...["Immediate Joiner", "15 Days", "30 Days", "60 Days", "Serving Notice Period"]
      .map((value, index) => ["NOTICE_PERIOD", value, value, true, (index + 1) * 10]),
  ],
  Settings: [
    ["ENVIRONMENT", "STAGING", "string", "Prevents production IDs and restricts email delivery", false],
    ["TIME_ZONE", "Asia/Kolkata", "string", "Dates and interview times", true],
    ["WEEKEND_DAYS", "SAT,SUN", "csv", "Closed by default unless a special-open rule applies", true],
    ["DEFAULT_SLOT_MINUTES", "30", "integer", "Default appointment interval for new panels", true],
    ["BOOKING_WINDOW_DAYS", "14", "integer", "How far ahead candidates may book", true],
    ["BOOKING_LEAD_MINUTES", "120", "integer", "Minimum notice for a same-day booking", true],
    ["OTP_TTL_MINUTES", "10", "integer", "Email verification lifetime", true],
    ["OTP_MAX_ATTEMPTS", "5", "integer", "Maximum incorrect verification attempts", true],
    ["EMAIL_MAX_ATTEMPTS", "5", "integer", "Maximum queued email delivery attempts", true],
    ["STAGING_EMAIL_ALLOWLIST", "", "csv", "Exact test recipients allowed to receive staging mail", true],
    ["STAGING_EMAIL_ALLOWED_DOMAINS", "mysktech.com", "csv", "Domains allowed to receive staging mail", true],
    ["REGISTRATION_EMAIL_ENABLED", "TRUE", "boolean", "Queue registration confirmations", true],
    ["BOOKING_EMAIL_ENABLED", "TRUE", "boolean", "Queue booking confirmations", true],
    ["RESCHEDULE_EMAIL_ENABLED", "TRUE", "boolean", "Queue reschedule confirmations", true],
    ["SUPPORT_EMAIL", "support@mysktech.com", "string", "Reply-to and support address", true],
    ["BOOKING_NOTIFICATION_TO", "", "csv", "Optional internal booking notification recipients", true],
    ["ADMIN_ALLOWLIST", "", "csv", "Optional admin email allowlist", true],
    ["ADMIN_DOMAIN", "", "string", "Optional Google Workspace admin domain", true],
    ["GA4_MEASUREMENT_ID", "G-253JM77BS2", "string", "Public GA4 measurement ID; analytics still requires consent", true],
    ["WEBSITE_BASE_URL", "", "string", "Staging website URL used in booking-management links", true],
    ["ALLOWED_WEB_ORIGINS", "http://127.0.0.1:4173,http://127.0.0.1:4174", "csv", "Exact origins allowed to receive web API responses", true],
    ["CONSENT_VERSION", "candidate-contact-v1", "string", "Consent version saved on candidate records", true],
    ["TURNSTILE_ENABLED", "FALSE", "boolean", "Reserved for a future verified frontend integration; keep disabled", false],
  ],
  _Sequences: [
    ["candidate", 1, "TEST-SK", 4],
    ["booking", 1, "TEST-BK-", 6],
    ["history", 1, "EVT-", 8],
    ["block", 1, "BLK-", 6],
    ["override", 1, "OVR-", 6],
    ["email", 1, "EML-", 8],
    ["audit", 1, "AUD-", 8],
  ],
};

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function applyHeaderStyle(sheet, width) {
  const end = columnName(width - 1);
  const header = sheet.getRange(`A1:${end}1`);
  header.format = {
    fill: headerFill,
    font: { name: font, size: 10, bold: true, color: headerText },
    borders: { preset: "all", style: "thin", color: border },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  header.format.rowHeightPx = 34;
  sheet.freezePanes.freezeRows(1);
  sheet.showGridLines = true;
}

function applyColumnSizing(sheet, headers, rowCount) {
  headers.forEach((header, index) => {
    const col = columnName(index);
    let width = 118;
    if (header === "key") width = 320;
    else if (header === "value") width = 190;
    else if (header === "type") width = 180;
    else if (header === "weekdays") width = 200;
    else if (header === "description") width = 400;
    else if (/json|reason|notes|skills/i.test(header)) width = 280;
    else if (/email|url|subject|company|label|name/i.test(header)) width = 170;
    else if (/createdAt|updatedAt|eventAt|expiresAt|attemptAt|sentAt|verifiedAt|consumedAt/i.test(header)) width = 155;
    else if (/date/i.test(header)) width = 110;
    else if (/time/i.test(header)) width = 92;
    else if (/active|attempts|capacity|version|sortOrder|padLength|nextValue/i.test(header)) width = 80;
    sheet.getRange(`${col}1:${col}${Math.max(rowCount + 1, 25)}`).format.columnWidthPx = width;
  });
}

function addValidation(sheet, headers, rowLimit = 2000) {
  const validationMap = {
    active: ["TRUE", "FALSE"],
    editable: ["TRUE", "FALSE"],
    status: ["ACTIVE", "PENDING", "REGISTERED", "SCHEDULED", "CONFIRMED", "PENDING_RESCHEDULE", "RESCHEDULED", "CANCELLED", "DRAFT", "DISABLED", "QUEUED", "SENT", "FAILED", "RETRY", "RETRY_SCHEDULED", "ATTEMPTING", "UNKNOWN", "SUPPRESSED", "PARTIAL", "READY", "EXPIRED", "VERIFIED", "CONSUMED", "LOCKED", "IN_PROGRESS", "COMPLETE"],
    scope: ["PANEL_SLOT", "PANEL_DAY", "GLOBAL_SLOT", "GLOBAL_DAY", "DATE_RANGE"],
    eventType: ["CREATED", "RESCHEDULED", "CANCELLED", "STATUS_CHANGED"],
    valueType: ["string", "integer", "boolean", "csv"],
  };

  headers.forEach((header, index) => {
    const values = validationMap[header];
    if (!values) return;
    const col = columnName(index);
    sheet.getRange(`${col}2:${col}${rowLimit}`).dataValidation = {
      rule: { type: "list", values },
    };
  });
}

const control = workbook.worksheets.add("Control");
control.showGridLines = true;
control.getRange("A2:F2").merge();
control.getRange("A2").values = [["SK Tech website v2 staging data"]];
control.getRange("A2:F2").format = {
  font: { name: font, size: 14, bold: true, color: "#202124" },
  verticalAlignment: "center",
};
control.getRange("A3:F3").merge();
control.getRange("A3").values = [["Test data only. No legacy records are imported during website development."]];
control.getRange("A3:F3").format = {
  font: { name: font, size: 10, italic: true, color: "#5F6368" },
};
control.getRange("A5:B11").values = [
  ["Environment", "STAGING"],
  ["Candidate ID prefix", "TEST-SK"],
  ["Booking ID prefix", "TEST-BK-"],
  ["Default closed days", "Saturday and Sunday"],
  ["Time zone", "Asia/Kolkata"],
  ["Legacy migration", "NOT STARTED"],
  ["Production cutover", "DISABLED"],
];
control.getRange("A5:A11").format = { fill: headerFill, font: { name: font, size: 10, bold: true } };
control.getRange("B5:B11").format = { fill: inputFill, font: { name: font, size: 10 } };
control.getRange("A13:F18").values = [
  ["Admin task", "Where", "Required fields", "Effect", "Safe default", "Notes"],
  ["Block one panel slot", "Slot_Blocks", "panelId, dateFrom, startTime, endTime", "Hides only that panel", "active=TRUE", "Use PANEL_SLOT"],
  ["Block one panel day", "Slot_Blocks", "panelId, dateFrom", "Hides that panel for the day", "active=TRUE", "Use PANEL_DAY"],
  ["Block all panels", "Slot_Blocks", "dateFrom and optional times", "Hides matching public slots", "active=TRUE", "Use GLOBAL_DAY or GLOBAL_SLOT"],
  ["Open a weekend", "Special_Open_Dates", "dateFrom, times and optional panelId", "Creates a date-specific opening", "active=TRUE", "Panel blank means all active panels"],
  ["Disable a rule", "Relevant rule tab", "active", "Rule stops applying", "active=FALSE", "Keep the row for audit history"],
];
control.getRange("A13:F13").format = {
  fill: headerFill,
  font: { name: font, size: 10, bold: true },
  borders: { preset: "all", style: "thin", color: border },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
control.getRange("A2:F18").format.font = { name: font, size: 10 };
control.getRange("A2:F2").format.font = { name: font, size: 14, bold: true, color: "#202124" };
control.getRange("A3:F3").format.font = { name: font, size: 10, italic: true, color: "#5F6368" };
control.getRange("A2:F3").format.wrapText = false;
control.getRange("A13:F18").format.wrapText = true;
control.getRange("A1:A25").format.columnWidthPx = 175;
control.getRange("B1:B25").format.columnWidthPx = 175;
control.getRange("C1:C25").format.columnWidthPx = 260;
control.getRange("D1:D25").format.columnWidthPx = 190;
control.getRange("E1:E25").format.columnWidthPx = 120;
control.getRange("F1:F25").format.columnWidthPx = 230;
control.freezePanes.freezeRows(3);
control.tabColor = "#1A73E8";

for (const [sheetName, headers] of Object.entries(schemas)) {
  const sheet = workbook.worksheets.add(sheetName);
  const rows = seedRows[sheetName] ?? [];
  const end = columnName(headers.length - 1);
  sheet.getRange(`A1:${end}1`).values = [headers];
  if (rows.length) {
    sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  }
  applyHeaderStyle(sheet, headers.length);
  applyColumnSizing(sheet, headers, rows.length);
  addValidation(sheet, headers);
  sheet.getRange(`A1:${end}${Math.max(rows.length + 1, 2)}`).format.font = { name: font, size: 10 };
  if (headers.includes("createdAt")) {
    const col = columnName(headers.indexOf("createdAt"));
    sheet.getRange(`${col}2:${col}2000`).setNumberFormat("yyyy-mm-dd hh:mm");
  }
  for (const header of ["updatedAt", "eventAt", "expiresAt", "nextAttemptAt", "lastAttemptAt", "sentAt", "verifiedAt", "consumedAt"]) {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(`${columnName(index)}2:${columnName(index)}2000`).setNumberFormat("yyyy-mm-dd hh:mm");
  }
  for (const header of ["date", "dateFrom", "dateTo", "postedDate", "effectiveFrom", "effectiveTo"]) {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.getRange(`${columnName(index)}2:${columnName(index)}2000`).setNumberFormat("yyyy-mm-dd");
  }
  if (sheetName.startsWith("_")) sheet.tabColor = "#9AA0A6";
}

workbook.recalculate();
await fs.mkdir(previewDir, { recursive: true });

for (const sheetName of ["Control", ...Object.keys(schemas)]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(previewDir, `${sheetName.replace(/[^A-Za-z0-9_-]/g, "_")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const inspection = await workbook.inspect({
  kind: "sheet,table",
  include: "id,name,range",
  maxChars: 12000,
  tableMaxRows: 4,
  tableMaxCols: 8,
});
await fs.writeFile(path.join(outputDir, "staging-workbook-inspection.ndjson"), inspection.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "staging-workbook-errors.ndjson"), errors.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewDir, sheets: ["Control", ...Object.keys(schemas)] }, null, 2));
