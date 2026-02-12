import crypto from "crypto";

export function generateCorrelationId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getHeaderValue(
  source: Record<string, unknown> | undefined,
  key: string
): string | null {
  if (!source) return null;

  const direct = source[key];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const lower = source[key.toLowerCase()];
  if (typeof lower === "string" && lower.trim().length > 0) {
    return lower.trim();
  }

  return null;
}
