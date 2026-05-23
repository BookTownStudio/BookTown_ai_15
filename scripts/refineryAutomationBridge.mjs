import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER = "booktownRefinery";
const PAYLOAD_SCHEMA_VERSION = 1;
const DEFAULT_SEMANTIC_FILE = "semantic_enrichment.jsonl";
const DEFAULT_VECTOR_FILE = "book_vectors.jsonl";
const DEFAULT_LEDGER_FILE = ".booktown-refinery-ledger.json";
const DEFAULT_PAYLOAD_FILE = "refinery_payload.json";
const TERMINAL_STATUSES = new Set(["exported", "accepted"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value, max = 512) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asOptionalNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value, max = 40) {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, max);
  return result.length > 0 ? result : undefined;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTitle(value) {
  return asString(value)
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${filePath}:${index + 1}: ${String(error)}`);
      }
    });
}

function readLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) {
    return {
      schemaVersion: 1,
      records: {},
      updatedAt: null,
    };
  }
  const parsed = JSON.parse(readFileSync(ledgerPath, "utf8"));
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.records)) {
    throw new Error(`Invalid refinery ledger schema: ${ledgerPath}`);
  }
  return parsed;
}

function writeJson(filePath, payload) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function pickTitle(record) {
  return (
    asString(record.title) ||
    asString(record.canonicalTitle) ||
    asString(record.titleEn) ||
    asString(record.workTitle)
  );
}

function normalizeOntology(record) {
  const ontology = isRecord(record.ontology) ? record.ontology : record;
  const form = asString(ontology.form || ontology.literaryForm, 80);
  const subForm = asString(ontology.subForm || ontology.subform, 120);
  const canonicalTradition = asString(ontology.canonicalTradition, 160);
  const result = {
    ...(form ? { form } : {}),
    ...(subForm ? { subForm } : {}),
    ...(canonicalTradition ? { canonicalTradition } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeSemanticRefs(record) {
  const refs = isRecord(record.semanticRefs) ? record.semanticRefs : record;
  const result = {
    schemaVersion: 1,
    ...(asString(refs.traditionEntityId, 160)
      ? { traditionEntityId: asString(refs.traditionEntityId, 160) }
      : {}),
    ...(asStringArray(refs.movementEntityIds) ? { movementEntityIds: asStringArray(refs.movementEntityIds) } : {}),
    ...(asStringArray(refs.philosophyEntityIds) ? { philosophyEntityIds: asStringArray(refs.philosophyEntityIds) } : {}),
    ...(asStringArray(refs.civilizationEntityIds)
      ? { civilizationEntityIds: asStringArray(refs.civilizationEntityIds) }
      : {}),
    ...(asStringArray(refs.historicalPeriodEntityIds)
      ? { historicalPeriodEntityIds: asStringArray(refs.historicalPeriodEntityIds) }
      : {}),
  };
  return Object.keys(result).length > 1 ? result : undefined;
}

function normalizeEmbeddingDescriptor(record) {
  const embedding = isRecord(record.embeddingDescriptor)
    ? record.embeddingDescriptor
    : isRecord(record.embedding)
      ? record.embedding
      : record;
  const model = asString(embedding.model || embedding.embeddingModel, 120);
  const vectorRef = asString(embedding.vectorRef || embedding.path || embedding.uri, 512);
  const contentHash = asString(embedding.contentHash || embedding.vectorHash, 160);
  const createdAt = asString(embedding.createdAt || embedding.generatedAt, 80);
  const dimensions = asOptionalNumber(embedding.dimensions);
  if (!model || !vectorRef || !contentHash || !createdAt || !Number.isInteger(dimensions) || dimensions <= 0) {
    return undefined;
  }
  return {
    model,
    dimensions,
    vectorRef,
    contentHash,
    createdAt,
  };
}

function mergeByTitle(semanticRows, vectorRows) {
  const byTitle = new Map();

  for (const semantic of semanticRows) {
    if (!isRecord(semantic)) continue;
    const title = pickTitle(semantic);
    const titleKey = normalizeTitle(title);
    if (!titleKey) continue;
    byTitle.set(titleKey, {
      title,
      semantic,
      vector: null,
    });
  }

  for (const vector of vectorRows) {
    if (!isRecord(vector)) continue;
    const title = pickTitle(vector);
    const titleKey = normalizeTitle(title);
    if (!titleKey) continue;
    const existing = byTitle.get(titleKey);
    byTitle.set(titleKey, {
      title: existing?.title || title,
      semantic: existing?.semantic || null,
      vector,
    });
  }

  return Array.from(byTitle.values()).sort((left, right) => left.title.localeCompare(right.title));
}

function buildArtifactVersion(semantic, vector) {
  return sha256(stableStringify({ semantic: semantic || null, vector: vector || null })).slice(0, 32);
}

function buildArtifact(row, generatedAt, factoryVersion) {
  const semantic = row.semantic || {};
  const vector = row.vector || {};
  const canonicalKey = asString(semantic.canonicalKey || vector.canonicalKey, 512);
  const artifactVersion = buildArtifactVersion(row.semantic, row.vector);
  const embeddingDescriptor = normalizeEmbeddingDescriptor(vector);
  const embeddingVersion =
    asString(vector.embeddingVersion || vector.version || embeddingDescriptor?.contentHash, 160) || null;
  const artifactId = sha256(`${normalizeTitle(row.title)}:${canonicalKey}:${artifactVersion}`).slice(0, 32);
  const ontology = normalizeOntology(semantic);
  const semanticRefs = normalizeSemanticRefs(semantic);
  const artifact = {
    title: row.title,
    ...(canonicalKey ? { canonicalKey } : {}),
    ...(ontology ? { ontology } : {}),
    ...(typeof semantic.literaryQuality === "number" ? { literaryQuality: semantic.literaryQuality } : {}),
    ...(typeof semantic.canonicalPotential === "number" ? { canonicalPotential: semantic.canonicalPotential } : {}),
    ...(semantic.confidence === "low" || semantic.confidence === "medium" || semantic.confidence === "high"
      ? { confidence: semantic.confidence }
      : {}),
    ...(semanticRefs ? { semanticRefs } : {}),
    ...(embeddingDescriptor ? { embeddingDescriptor } : {}),
    provenance: {
      source: PROVIDER,
      artifactId,
      factoryVersion,
      contentHash: `sha256:${artifactVersion}`,
      generatedAt,
    },
  };
  return {
    artifact,
    ledgerRecord: {
      title: row.title,
      canonicalKey: canonicalKey || null,
      artifactVersion,
      embeddingVersion,
    },
  };
}

function shouldExport(record, next, retryFailed) {
  if (!record) return true;
  if (TERMINAL_STATUSES.has(record.status)) {
    return record.artifactVersion !== next.artifactVersion ||
      (record.embeddingVersion || null) !== (next.embeddingVersion || null);
  }
  if (record.status === "failed") {
    return retryFailed === true;
  }
  return true;
}

export function buildRefineryExport(options) {
  const startedAt = Date.now();
  const inputDir = path.resolve(options.inputDir || process.cwd());
  const outputDir = path.resolve(options.outputDir || inputDir);
  const semanticPath = path.resolve(inputDir, options.semanticFile || DEFAULT_SEMANTIC_FILE);
  const vectorPath = path.resolve(inputDir, options.vectorFile || DEFAULT_VECTOR_FILE);
  const ledgerPath = path.resolve(outputDir, options.ledgerFile || DEFAULT_LEDGER_FILE);
  const payloadPath = path.resolve(outputDir, options.payloadFile || DEFAULT_PAYLOAD_FILE);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const factoryVersion = options.factoryVersion || "local";
  const retryFailed = options.retryFailed === true;
  const ledger = readLedger(ledgerPath);

  const semanticRows = readJsonl(semanticPath);
  const vectorRows = readJsonl(vectorPath);
  const merged = mergeByTitle(semanticRows, vectorRows);
  const artifacts = [];
  const nextRecords = { ...ledger.records };
  const stats = {
    processed: 0,
    rejected: 0,
    failed: 0,
    duplicate: 0,
    exported: 0,
  };

  for (const row of merged) {
    stats.processed += 1;
    const { artifact, ledgerRecord } = buildArtifact(row, generatedAt, factoryVersion);
    const ledgerKey = artifact.provenance.artifactId;
    const existing = ledger.records[ledgerKey];
    if (!shouldExport(existing, ledgerRecord, retryFailed)) {
      stats.duplicate += 1;
      continue;
    }

    artifacts.push(artifact);
    stats.exported += 1;
    nextRecords[ledgerKey] = {
      ...ledgerRecord,
      status: "exported",
      exportedAt: generatedAt,
      retryCount: existing?.status === "failed" ? Number(existing.retryCount || 0) + 1 : Number(existing?.retryCount || 0),
      lastPayloadPath: payloadPath,
      updatedAt: generatedAt,
    };
  }

  const payload = {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    generatedAt,
    provider: PROVIDER,
    sourceFiles: {
      semantic: semanticPath,
      vectors: vectorPath,
    },
    observability: {
      ...stats,
      durationMs: Date.now() - startedAt,
      exportBatchSize: artifacts.length,
    },
    callableName: "submitRefineryArtifacts",
    callablePayload: {
      artifacts,
    },
  };

  const nextLedger = {
    schemaVersion: 1,
    updatedAt: generatedAt,
    records: nextRecords,
  };

  if (options.write !== false) {
    writeJson(payloadPath, payload);
    writeJson(ledgerPath, nextLedger);
  }

  return {
    payload,
    ledger: nextLedger,
    paths: {
      semanticPath,
      vectorPath,
      ledgerPath,
      payloadPath,
    },
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input-dir") options.inputDir = argv[++index];
    else if (arg === "--output-dir") options.outputDir = argv[++index];
    else if (arg === "--semantic-file") options.semanticFile = argv[++index];
    else if (arg === "--vector-file") options.vectorFile = argv[++index];
    else if (arg === "--ledger-file") options.ledgerFile = argv[++index];
    else if (arg === "--payload-file") options.payloadFile = argv[++index];
    else if (arg === "--factory-version") options.factoryVersion = argv[++index];
    else if (arg === "--retry-failed") options.retryFailed = true;
    else if (arg === "--dry-run") options.write = false;
    else if (arg === "--help") options.help = true;
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/refineryAutomationBridge.mjs --input-dir <dir> [--output-dir <dir>]

Reads semantic_enrichment.jsonl and book_vectors.jsonl, combines records by title,
writes refinery_payload.json, and updates a local incremental export ledger.

Options:
  --input-dir <dir>         Directory containing refinery JSONL outputs.
  --output-dir <dir>        Directory for refinery_payload.json and ledger.
  --factory-version <ver>   Local factory version recorded in provenance.
  --retry-failed            Re-export ledger records marked failed.
  --dry-run                 Build in memory and print stats without writing files.
`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const result = buildRefineryExport(options);
    console.log(JSON.stringify({
      payloadPath: result.paths.payloadPath,
      ledgerPath: result.paths.ledgerPath,
      observability: result.payload.observability,
    }, null, 2));
  } catch (error) {
    console.error("[BOOKTOWN_REFINERY_EXPORT][FAIL]", String(error));
    process.exitCode = 1;
  }
}
