import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { evaluateProjectionCertification } from "../operations/projectionRecoveryControlPlane";
import { getProjectionDefinition } from "../operations/projectionRegistry";
import { bookStatsMatches, catalogCountersMatch, type ExpectedBookStatsCounters } from "./recoverBookStats";

const functionsRoot = process.cwd();

function readFunctionsFile(path: string): string {
  return readFileSync(resolve(functionsRoot, path), "utf8");
}

describe("book stats certification wiring", () => {
  it("registers book_stats and book catalog counters as production-ready", () => {
    const bookStats = getProjectionDefinition("book_stats");
    const catalogCounters = getProjectionDefinition("book_catalog_counter_projection");

    expect(bookStats).toBeTruthy();
    expect(catalogCounters).toBeTruthy();
    expect(bookStats?.currentCertificationStatus).toBe("production_ready");
    expect(catalogCounters?.currentCertificationStatus).toBe("production_ready");
    expect(bookStats?.authoritySources).toEqual(["reviews/{reviewId}"]);
    expect(catalogCounters?.authoritySources).toEqual(["reviews/{reviewId}"]);
    expect(evaluateProjectionCertification(bookStats!).passed).toBe(true);
    expect(evaluateProjectionCertification(catalogCounters!).passed).toBe(true);
  });

  it("uses canonical reviews only and excludes legacy book-scoped authority", () => {
    const source = readFunctionsFile("src/admin/recoverBookStats.ts");

    expect(source).toContain('.collection("reviews")');
    expect(source).toContain('.where("bookId", "==", bookId)');
    expect(source).toContain('.where("status", "==", "active")');
    expect(source).toContain('.where("visibility", "==", "public")');
    expect(source).not.toContain('collection("books").doc(bookId).collection("reviews")');
    expect(source).not.toContain('collection("books").doc(bookId).collection("ratings")');
    expect(source).not.toContain("books/${bookId}/reviews");
    expect(source).not.toContain("books/${bookId}/ratings");
  });

  it("defaults to dry-run, requires repair mode for writes, and avoids increment repair", () => {
    const source = readFunctionsFile("src/admin/recoverBookStats.ts");

    expect(source).toContain('readString(input.mode, 20) === "write" ? "write" : "dry_run"');
    expect(source).toContain('request.mode === "write" && request.reconciliationMode === "repair"');
    expect(source).toContain("await writeExactBookCounters(candidate.bookId, expected)");
    expect(source).not.toContain("FieldValue.increment");
  });

  it("detects flat, nested, and catalog counter drift", () => {
    const expected: ExpectedBookStatsCounters = {
      reviews: 2,
      ratingsCount: 2,
      ratingSum: 9,
      averageRating: 4.5,
    };

    expect(bookStatsMatches(expected, {
      reviews: 2,
      ratingsCount: 2,
      ratingSum: 9,
      averageRating: 4.5,
      counters: {
        reviews: 2,
        ratingsCount: 2,
        ratingSum: 9,
        averageRating: 4.5,
      },
    })).toBe(true);
    expect(bookStatsMatches(expected, {
      reviews: 2,
      ratingsCount: 2,
      ratingSum: 9,
      averageRating: 4.5,
      counters: {
        reviews: 1,
        ratingsCount: 2,
        ratingSum: 9,
        averageRating: 4.5,
      },
    })).toBe(false);
    expect(catalogCountersMatch(expected, {
      rating: 4.5,
      ratingsCount: 2,
      reviewCount: 2,
      reviewsCount: 2,
    })).toBe(true);
    expect(catalogCountersMatch(expected, {
      rating: 4.5,
      ratingsCount: 2,
      reviewCount: 2,
    })).toBe(false);
  });

  it("documents authority, non-authority, dry-run, write, and checkpointed recovery", () => {
    const runbook = readFunctionsFile("../docs/operations/projections/BookStatsRecoveryRunbook.md");

    expect(runbook).toContain("reviews/{reviewId}");
    expect(runbook).toContain("books/{bookId}/reviews/{reviewId}");
    expect(runbook).toContain("books/{bookId}/ratings/{userId}");
    expect(runbook).toContain('"mode": "dry_run"');
    expect(runbook).toContain('"reconciliationMode": "repair"');
    expect(runbook).toContain('"scope": "checkpointed_full"');
    expect(runbook).toContain("book_catalog_counter_projection");
  });
});
