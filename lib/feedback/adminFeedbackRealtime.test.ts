import { describe, expect, it } from "vitest";
import {
  applyRealtimeReports,
  mergeRealtimeActivityDetail,
  mergeRealtimeReportDetail,
} from "./adminFeedbackRealtime.ts";
import type { AdminFeedbackActivity, AdminFeedbackReport } from "../../contracts/apiContracts.ts";
import type { AdminFeedbackDetail } from "../services/adminService.ts";

const report = (id: string, status: AdminFeedbackReport["status"] = "new"): AdminFeedbackReport => ({
  id,
  uid: "user-1",
  source: "drawer",
  intentType: "bug",
  status,
  text: "Feedback text",
  contactEmail: "beta@example.com",
  clientContext: null,
  serverContext: {
    authRole: "user",
    callableRegion: "default",
    correlationId: "corr-1",
    schemaVersion: 1,
  },
  createdAt: "2026-05-21T00:00:00.000Z",
  updatedAt: "2026-05-21T00:00:00.000Z",
  updatedBy: null,
});

describe("admin feedback realtime cache reducers", () => {
  it("replaces the bounded visible queue without duplicating entries", () => {
    const next = applyRealtimeReports({ reports: [report("old")], nextCursor: "cursor-1" }, [
      report("new"),
      report("old", "triaged"),
    ]);

    expect(next.reports.map((item) => item.id)).toEqual(["new", "old"]);
    expect(next.reports[1].status).toBe("triaged");
    expect(next.nextCursor).toBe("cursor-1");
  });

  it("syncs selected report status without losing attachments or activity", () => {
    const detail: AdminFeedbackDetail = {
      report: report("feedback-1"),
      activity: [],
      attachments: [],
    };

    expect(mergeRealtimeReportDetail(detail, report("feedback-1", "resolved"))).toMatchObject({
      report: { id: "feedback-1", status: "resolved" },
      attachments: [],
      activity: [],
    });
  });

  it("syncs activity updates without replacing report data", () => {
    const detail: AdminFeedbackDetail = {
      report: report("feedback-1"),
      activity: [],
      attachments: [],
    };
    const activity: AdminFeedbackActivity[] = [{
      id: "activity-1",
      type: "note_added",
      actorUid: "admin-1",
      createdAt: "2026-05-21T00:01:00.000Z",
      payload: { note: "Needs review" },
    }];

    expect(mergeRealtimeActivityDetail(detail, activity)).toMatchObject({
      report: { id: "feedback-1" },
      activity,
      attachments: [],
    });
  });
});
