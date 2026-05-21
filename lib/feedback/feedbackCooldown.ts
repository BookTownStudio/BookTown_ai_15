export const FEEDBACK_SOFT_COOLDOWN_MS = 60_000;

const STORAGE_KEY = "booktown.feedback.lastSubmittedAtMs";

export const FEEDBACK_COOLDOWN_MESSAGE_EN =
  "Wow, you're fast! We're processing your last note. Hang tight for a few seconds before sending the next one so our system can keep up!";

export const FEEDBACK_COOLDOWN_MESSAGE_AR =
  "أنت سريع جداً! نعالج ملاحظتك السابقة الآن. انتظر بضع ثوانٍ قبل إرسال الملاحظة التالية حتى يواكب النظام ذلك.";

export function getFeedbackCooldownMessage(lang: "en" | "ar" | string): string {
  return lang === "ar" ? FEEDBACK_COOLDOWN_MESSAGE_AR : FEEDBACK_COOLDOWN_MESSAGE_EN;
}

export function isFeedbackCooldownError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("RESOURCE_EXHAUSTED")
    || message.includes("FEEDBACK_SOFT_COOLDOWN_ACTIVE")
    || message.includes("FEEDBACK_BURST_QUOTA_EXCEEDED");
}

function readLastSubmittedAtMs(): number | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function markFeedbackSubmitted(nowMs = Date.now()): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(nowMs));
}

export function getFeedbackCooldownRemainingMs(nowMs = Date.now()): number {
  const lastSubmittedAtMs = readLastSubmittedAtMs();
  if (!lastSubmittedAtMs) return 0;

  const elapsedMs = Math.max(0, nowMs - lastSubmittedAtMs);
  return Math.max(0, FEEDBACK_SOFT_COOLDOWN_MS - elapsedMs);
}

export function isFeedbackCooldownActive(nowMs = Date.now()): boolean {
  return getFeedbackCooldownRemainingMs(nowMs) > 0;
}
