import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerInfo = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock("firebase-functions/logger", () => ({
  info: loggerInfo,
  warn: loggerWarn,
  error: loggerError,
}));

describe("recordReaderDiagnostic", () => {
  beforeEach(() => {
    loggerInfo.mockClear();
    loggerWarn.mockClear();
    loggerError.mockClear();
  });

  it("logs safe structured diagnostics without sensitive reader content", async () => {
    const { recordReaderDiagnosticHandler } = await import("../recordReaderDiagnostic");

    const result = await recordReaderDiagnosticHandler({
      auth: { uid: "user_diag", token: {} },
      data: {
        eventName: "reader_runtime_failed",
        severity: "error",
        payload: {
          bookId: "book_1",
          format: "epub",
          category: "malformed_epub",
          phase: "render",
          quote: "private highlighted text",
          note: "private note",
          cfi: "epubcfi(/6/2)",
          signedUrl: "https://example.test/private",
        },
      },
    });

    expect(result).toEqual({ ok: true });
    expect(loggerError).toHaveBeenCalledTimes(1);
    const [, payload] = loggerError.mock.calls[0];
    expect(payload).toMatchObject({
      uid: "user_diag",
      eventName: "reader_runtime_failed",
      severity: "error",
      bookId: "book_1",
      format: "epub",
      category: "malformed_epub",
      phase: "render",
    });
    expect(payload).not.toHaveProperty("quote");
    expect(payload).not.toHaveProperty("note");
    expect(payload).not.toHaveProperty("cfi");
    expect(payload).not.toHaveProperty("signedUrl");
  });

  it("rejects unknown diagnostic events", async () => {
    const { recordReaderDiagnosticHandler } = await import("../recordReaderDiagnostic");

    await expect(recordReaderDiagnosticHandler({
      auth: { uid: "user_diag", token: {} },
      data: {
        eventName: "reader_text_captured",
        severity: "info",
        payload: {},
      },
    })).rejects.toThrow("Invalid reader diagnostic event.");
  });
});
