import { describe, expect, it } from "vitest";

import { normalizeDashboardPayload } from "./dashboard-model";

describe("dashboard payload normalization", () => {
  it("accepts the Apps Script nested dashboard contract", () => {
    const result = normalizeDashboardPayload({
      generatedAt: "2026-10-19T10:00:00.000Z",
      timezone: "Asia/Kolkata",
      counts: {
        upcomingInterviews: 3,
        todayInterviews: 1,
        newOpenings: 8,
        oldOpenings: 12,
      },
      interviews: {
        allUpcoming: [
          {
            id: "SK32",
            round: "Round 1",
            date: "2026-10-19",
            from: "10:00",
            to: "10:30",
            batch: "2",
            statusLabel: "BOOKED",
            candidateEmail: "must-not-enter-the-dom@example.com",
          },
          {
            id: "SK44",
            round: "Round 2",
            date: "2026-10-20",
            from: "11:00",
            to: "11:30",
            batch: "3",
            stateCategory: "CONFLICT",
          },
          {
            id: "Unavailable",
            round: "Panel unavailable",
            date: "2026-10-21",
            from: "09:00",
            to: "12:00",
            batch: "",
            stateCategory: "PANEL_OR_WEEKEND_UNAVAILABLE",
          },
        ],
      },
      availability: {
        tableRows: [
          {
            id: "Available",
            date: "2026-10-20",
            from: "09:00",
            to: "09:30",
            remainingCapacity: 2,
          },
        ],
      },
    }, "2026-10-19");

    expect(result.counts).toEqual({ upcoming: 3, today: 1, newOpenings: 8, oldOpenings: 12 });
    expect(result.interviews.map((row) => row.category)).toEqual(["today", "conflict", "unavailable"]);
    expect(result.availableSlots).toHaveLength(1);
    expect(result.availableSlots[0]?.startTime).toBe("09:00");
    expect(JSON.stringify(result)).not.toContain("must-not-enter-the-dom@example.com");
  });
});
