import { admin } from "../firebaseAdmin";
import type { AgentContextSnapshot } from "./types";
import { INTELLIGENCE_PRIVACY_TIER } from "./types";
import { timestampToIso } from "./profileBuilder";

const db = admin.firestore();

function normalizeUid(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.slice(0, 128);
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function readString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function topGenres(distributionRaw: unknown, limit: number): Array<{ name: string; weight: number }> {
  if (!distributionRaw || typeof distributionRaw !== "object" || Array.isArray(distributionRaw)) {
    return [];
  }

  const rows = Object.entries(distributionRaw as Record<string, unknown>)
    .map(([name, weight]) => ({ name: name.trim(), weight: readNumber(weight) }))
    .filter((row) => row.name.length > 0 && row.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, limit));

  return rows;
}

export async function buildAgentContextSnapshot(uid: string | null): Promise<AgentContextSnapshot | null> {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) {
    return null;
  }

  const rootRef = db.collection("user_intelligence_profiles").doc(normalizedUid);
  const [
    metadataSnap,
    readingSnap,
    genresSnap,
    behaviorSnap,
    indicesSnap,
    engagementSnap,
  ] = await Promise.all([
    rootRef.collection("metadata").doc("current").get(),
    rootRef.collection("reading").doc("current").get(),
    rootRef.collection("genres").doc("current").get(),
    rootRef.collection("behavior").doc("current").get(),
    rootRef.collection("indices").doc("current").get(),
    rootRef.collection("engagement").doc("current").get(),
  ]);

  if (!metadataSnap.exists) {
    return null;
  }

  const privacyTier = readString(metadataSnap.get("privacyTier")) || INTELLIGENCE_PRIVACY_TIER;

  return {
    schemaVersion: Math.max(1, Math.trunc(readNumber(metadataSnap.get("schemaVersion")) || 1)),
    profileVersion: Math.max(0, Math.trunc(readNumber(metadataSnap.get("profileVersion")))),
    privacyTier,
    computedAt: timestampToIso(metadataSnap.get("computedAt")),
    reading: {
      totalBooksRead: Math.max(0, Math.trunc(readNumber(readingSnap.get("totalBooksRead")))),
      completionRate: readNumber(readingSnap.get("completionRate")),
      readingVelocity: readNumber(readingSnap.get("readingVelocity")),
    },
    genres: {
      dominantGenre: readString(genresSnap.get("dominantGenre")),
      entropyScore: readNumber(genresSnap.get("entropyScore")),
      topGenres: topGenres(genresSnap.get("distribution"), 3),
    },
    behavior: {
      noveltyTolerance: readNumber(behaviorSnap.get("noveltyTolerance")),
      deviationTolerance: readNumber(behaviorSnap.get("deviationTolerance")),
      depthPreference: readNumber(behaviorSnap.get("depthPreference")),
      abandonmentRate: readNumber(behaviorSnap.get("abandonmentRate")),
    },
    indices: {
      explorationIndex: readNumber(indicesSnap.get("explorationIndex")),
      completionConsistency: readNumber(indicesSnap.get("completionConsistency")),
      culturalDepthIndex: readNumber(indicesSnap.get("culturalDepthIndex")),
    },
    engagement: {
      socialEngagementIndex: readNumber(engagementSnap.get("socialEngagementIndex")),
      quoteDensity: readNumber(engagementSnap.get("quoteDensity")),
      reviewFrequency: readNumber(engagementSnap.get("reviewFrequency")),
    },
  };
}
