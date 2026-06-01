import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";
import { eventStatsMatches, type ExpectedEventStatsCounters } from "./recoverEventStats";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("event stats certification wiring", () => {
  it("registers event_stats as production-ready and certified", () => {
    const definition = getProjectionDefinition("event_stats");

    expect(definition).toBeTruthy();
    expect(definition?.currentCertificationStatus).toBe("production_ready");
    expect(definition?.authoritySources).toEqual(["events/{eventId}/rsvps/{userId}"]);
    expect(definition?.projectionCollections).toEqual(["event_stats"]);
    expect(evaluateProjectionCertification(definition!).passed).toBe(true);
  });

  it("uses RSVP authority only and never performs increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverEventStats.ts");

    expect(source).toContain('collection("events").doc(eventId).collection("rsvps").count().get()');
    expect(source).toContain("await writeExactEventCounters(candidate.eventId, expected)");
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).not.toContain("FieldValue.increment");
  });

  it("detects flat, compatibility, and timestamp drift", () => {
    const expected: ExpectedEventStatsCounters = { rsvps: 2 };
    const timestamp = { toMillis: () => 1 };

    expect(eventStatsMatches(expected, {
      rsvps: 2,
      rsvpsCount: 2,
      counters: { rsvps: 2 },
      updatedAt: timestamp,
    })).toBe(true);
    expect(eventStatsMatches(expected, {
      rsvps: 2,
      rsvpsCount: 1,
      counters: { rsvps: 2 },
      updatedAt: timestamp,
    })).toBe(false);
    expect(eventStatsMatches(expected, {
      rsvps: 2,
      rsvpsCount: 2,
      counters: { rsvps: 2 },
    })).toBe(false);
  });

  it("documents event stats recovery and venue stats exclusion", () => {
    const eventRunbook = readFunctionsFile("../docs/operations/projections/EventStatsRecoveryRunbook.md");
    const venueRunbook = readFunctionsFile("../docs/operations/projections/VenueStatsDeprecationRunbook.md");
    const registry = readFunctionsFile("../docs/architecture/ProjectionRegistry.md");

    expect(eventRunbook).toContain("events/{eventId}/rsvps/{userId}");
    expect(eventRunbook).toContain('"mode": "dry_run"');
    expect(eventRunbook).toContain('"reconciliationMode": "repair"');
    expect(eventRunbook).toContain('"scope": "checkpointed_full"');
    expect(venueRunbook).toContain("excluded from Phase 8A production certification");
    expect(registry).toContain("reader_search_index");
    expect(registry).toContain("compatibility_sidecar");
  });
});
