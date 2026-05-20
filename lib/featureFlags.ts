export type BookTownFeatureFlags = {
  enableBetaFeedbackTrigger: boolean;
};

function readBooleanFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

export const featureFlags: BookTownFeatureFlags = {
  enableBetaFeedbackTrigger: readBooleanFlag((import.meta as any).env?.VITE_ENABLE_BETA_FEEDBACK_TRIGGER),
};

export function isBetaFeedbackTriggerEnabled(
  flags: BookTownFeatureFlags = featureFlags
): boolean {
  return flags.enableBetaFeedbackTrigger;
}
