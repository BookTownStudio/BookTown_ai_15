import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildRefineryExport } from "../../scripts/refineryAutomationBridge.mjs";

const tempDirs: string[] = [];

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "booktown-refinery-"));
  tempDirs.push(dir);
  return dir;
}

function writeJsonl(filePath: string, rows: unknown[]) {
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("refineryAutomationBridge", () => {
  it("exports valid incremental payload and preserves authority boundaries", () => {
    const dir = tempDir();
    writeJsonl(path.join(dir, "semantic_enrichment.jsonl"), [
      {
        title: "Crime and Punishment",
        canonicalKey: "crime-and-punishment::fyodor-dostoevsky",
        ontology: {
          form: "novel",
          subForm: "philosophical_prose",
          canonicalTradition: "russian_realism",
        },
        literaryQuality: 0.98,
        canonicalPotential: 0.99,
        confidence: "high",
        semanticRefs: {
          schemaVersion: 1,
          movementEntityIds: ["russian_realism"],
        },
      },
    ]);
    writeJsonl(path.join(dir, "book_vectors.jsonl"), [
      {
        title: "Crime and Punishment",
        embeddingVersion: "embed-v1",
        embeddingDescriptor: {
          model: "booktown-refinery",
          dimensions: 1536,
          vectorRef: "vectors/books/crime-and-punishment",
          contentHash: "sha256:vector",
          createdAt: "2026-05-23T00:00:00.000Z",
        },
      },
    ]);

    const result = buildRefineryExport({
      inputDir: dir,
      outputDir: dir,
      factoryVersion: "factory-v1",
      generatedAt: "2026-05-23T00:00:00.000Z",
    });

    expect(result.payload.schemaVersion).toBe(1);
    expect(result.payload.callableName).toBe("submitRefineryArtifacts");
    expect(result.payload.observability).toMatchObject({
      processed: 1,
      duplicate: 0,
      exported: 1,
      exportBatchSize: 1,
    });
    expect(result.payload.callablePayload.artifacts).toHaveLength(1);
    const artifact = result.payload.callablePayload.artifacts[0] as Record<string, unknown>;
    expect(artifact.provenance).toMatchObject({
      source: "booktownRefinery",
      factoryVersion: "factory-v1",
    });
    expect(artifact).not.toHaveProperty("canonicalTitle");
    expect(artifact).not.toHaveProperty("author");
    expect(artifact).not.toHaveProperty("readableSources");
    expect(artifact).not.toHaveProperty("workIdentity");

    const written = JSON.parse(readFileSync(path.join(dir, "refinery_payload.json"), "utf8"));
    expect(written.callablePayload.artifacts).toHaveLength(1);
  });

  it("rejects duplicate export when artifact versions are unchanged", () => {
    const dir = tempDir();
    const semanticRows = [
      {
        title: "The Trial",
        canonicalKey: "the-trial::franz-kafka",
        ontology: { form: "novel" },
      },
    ];
    const vectorRows = [
      {
        title: "The Trial",
        embeddingVersion: "embed-v1",
        embeddingDescriptor: {
          model: "booktown-refinery",
          dimensions: 1536,
          vectorRef: "vectors/books/the-trial",
          contentHash: "sha256:trial-vector",
          createdAt: "2026-05-23T00:00:00.000Z",
        },
      },
    ];
    writeJsonl(path.join(dir, "semantic_enrichment.jsonl"), semanticRows);
    writeJsonl(path.join(dir, "book_vectors.jsonl"), vectorRows);

    buildRefineryExport({
      inputDir: dir,
      outputDir: dir,
      generatedAt: "2026-05-23T00:00:00.000Z",
    });
    const second = buildRefineryExport({
      inputDir: dir,
      outputDir: dir,
      generatedAt: "2026-05-23T00:10:00.000Z",
    });

    expect(second.payload.callablePayload.artifacts).toHaveLength(0);
    expect(second.payload.observability.duplicate).toBe(1);
  });

  it("exports changed artifact versions incrementally", () => {
    const dir = tempDir();
    writeJsonl(path.join(dir, "semantic_enrichment.jsonl"), [
      { title: "The Plague", canonicalKey: "the-plague::albert-camus", ontology: { form: "novel" } },
    ]);
    writeJsonl(path.join(dir, "book_vectors.jsonl"), []);
    buildRefineryExport({ inputDir: dir, outputDir: dir });

    writeJsonl(path.join(dir, "semantic_enrichment.jsonl"), [
      {
        title: "The Plague",
        canonicalKey: "the-plague::albert-camus",
        ontology: { form: "novel", subForm: "philosophical_prose" },
      },
    ]);
    const result = buildRefineryExport({ inputDir: dir, outputDir: dir });

    expect(result.payload.callablePayload.artifacts).toHaveLength(1);
    expect(result.payload.observability.exported).toBe(1);
  });

  it("retries records marked failed only when retryFailed is enabled", () => {
    const dir = tempDir();
    writeJsonl(path.join(dir, "semantic_enrichment.jsonl"), [
      { title: "Kokoro", canonicalKey: "kokoro::natsume-soseki", ontology: { form: "novel" } },
    ]);
    writeJsonl(path.join(dir, "book_vectors.jsonl"), []);
    const first = buildRefineryExport({ inputDir: dir, outputDir: dir });
    const artifactId = (first.payload.callablePayload.artifacts[0] as any).provenance.artifactId;
    const ledger = JSON.parse(readFileSync(path.join(dir, ".booktown-refinery-ledger.json"), "utf8"));
    ledger.records[artifactId].status = "failed";
    ledger.records[artifactId].retryCount = 2;
    writeFileSync(path.join(dir, ".booktown-refinery-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);

    const skipped = buildRefineryExport({ inputDir: dir, outputDir: dir });
    expect(skipped.payload.callablePayload.artifacts).toHaveLength(0);

    const retried = buildRefineryExport({ inputDir: dir, outputDir: dir, retryFailed: true });
    expect(retried.payload.callablePayload.artifacts).toHaveLength(1);
    expect((retried.ledger.records as any)[artifactId].retryCount).toBe(3);
  });

  it("fails schema validation for malformed JSONL", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "semantic_enrichment.jsonl"), "{bad-json}\n", "utf8");
    writeJsonl(path.join(dir, "book_vectors.jsonl"), []);

    expect(() => buildRefineryExport({ inputDir: dir, outputDir: dir })).toThrow("Invalid JSONL");
  });
});
