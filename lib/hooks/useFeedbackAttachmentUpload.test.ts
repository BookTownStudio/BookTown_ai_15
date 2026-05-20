import { describe, expect, it } from "vitest";
import { validateFeedbackAttachmentFile } from "./useFeedbackAttachmentUpload.ts";

describe("feedback attachment upload validation", () => {
  it("accepts bounded screenshot image files", () => {
    const file = new File(["ok"], "shot.png", { type: "image/png" });
    expect(() => validateFeedbackAttachmentFile(file)).not.toThrow();
  });

  it("rejects non-image and oversized files", () => {
    const pdf = new File(["bad"], "bad.pdf", { type: "application/pdf" });
    const large = new File([new Uint8Array(6 * 1024 * 1024)], "large.png", { type: "image/png" });
    expect(() => validateFeedbackAttachmentFile(pdf)).toThrow(/PNG, JPEG, or WebP/);
    expect(() => validateFeedbackAttachmentFile(large)).toThrow(/5MB/);
  });
});
