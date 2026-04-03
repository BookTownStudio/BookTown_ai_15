import * as logger from "firebase-functions/logger";
import type {
  ExternalReadableCandidate,
  ProviderLookupContext,
} from "./types";

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractProviderIds(book: Record<string, unknown>, prefix: string): string[] {
  const providerExternalIds = asStringArray(book.providerExternalIds);
  return providerExternalIds
    .filter((entry) => entry.startsWith(`${prefix}:`))
    .map((entry) => entry.slice(prefix.length + 1))
    .filter((entry) => entry.length > 0);
}

export async function resolveHindawiReadableCandidate(
  ctx: ProviderLookupContext
): Promise<ExternalReadableCandidate | null> {
  const ids = extractProviderIds(ctx.book, "hindawi");
  if (ids.length === 0) {
    logger.info("[ACQUIRE][HINDAWI][SKIP_NO_PROVIDER_ID]", {
      bookId: ctx.bookId,
    });
    return null;
  }

  const title = asNonEmptyString(ctx.book.titleAr) || asNonEmptyString(ctx.book.titleEn);
  for (const providerExternalId of ids) {
    return {
      provider: "hindawi",
      providerExternalId,
      title,
      language: "ar",
      trust: {
        availabilityTrust: true,
        acquisitionTrust: true,
      },
      candidates: [
        {
          format: "epub",
          url: `https://downloads.hindawi.org/books/${providerExternalId}.epub`,
          mimeType: "application/epub+zip",
        },
        {
          format: "pdf",
          url: `https://downloads.hindawi.org/books/${providerExternalId}.pdf`,
          mimeType: "application/pdf",
        },
      ],
    };
  }

  return null;
}
