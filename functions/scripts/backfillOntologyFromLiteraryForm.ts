#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { safeBatchSetBookMerge } from "./bookOntologyScriptSafety";

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const entry = raw.slice(2);
    const eqIndex = entry.indexOf("=");
    if (eqIndex === -1) {
      args[entry] = true;
      continue;
    }
    args[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
  }
  return args;
}

function asBool(value: string | boolean | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function asPositiveInt(
  value: string | boolean | undefined,
  fallback: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasOntologyForm(data: FirebaseFirestore.DocumentData): boolean {
  const ontology = data.ontology;
  if (!ontology || typeof ontology !== "object" || Array.isArray(ontology)) {
    return false;
  }
  return asNonEmptyString((ontology as Record<string, unknown>).form).length > 0;
}

function initializeAdmin(args: CliArgs): void {
  if (getApps().length > 0) return;

  const projectId =
    asNonEmptyString(args["project-id"]) ||
    asNonEmptyString(process.env.FIREBASE_PROJECT_ID) ||
    undefined;
  const serviceAccountArg =
    asNonEmptyString(args["service-account"]) ||
    asNonEmptyString(process.env.SERVICE_ACCOUNT_PATH);

  if (serviceAccountArg) {
    const serviceAccountPath = path.resolve(process.cwd(), serviceAccountArg);
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Service account file was not found: ${serviceAccountPath}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      ...(projectId ? { projectId } : {}),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

function printUsage(): void {
  console.log(`
Usage:
  npx ts-node scripts/backfillOntologyFromLiteraryForm.ts [options]

Options:
  --dry-run=true|false      Default: true
  --page-size=<n>           Default: 400, max: 450
  --max-pages=<n>           Default: 100000
  --project-id=<id>         Optional Firebase project id
  --service-account=<path>  Optional service account JSON path
  --help                    Show this help
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === true || args.help === "true") {
    printUsage();
    return;
  }

  const dryRun = asBool(args["dry-run"], true);
  const pageSize = asPositiveInt(args["page-size"], 400, 450);
  const maxPages = asPositiveInt(args["max-pages"], 100000, 1000000);

  initializeAdmin(args);
  const db = getFirestore();

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let pages = 0;
  let total = 0;
  let skippedExistingOntology = 0;
  let wouldWrite = 0;
  let written = 0;
  let fromLiteraryForm = 0;
  let unknown = 0;
  let batchCount = 0;

  while (pages < maxPages) {
    pages += 1;
    let query: FirebaseFirestore.Query = db
      .collection("books")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    let pendingWrites = 0;

    for (const doc of snap.docs) {
      total += 1;
      const data = doc.data();
      if (hasOntologyForm(data)) {
        skippedExistingOntology += 1;
        continue;
      }

      const literaryForm = asNonEmptyString(data.literaryForm);
      const form = literaryForm || "unknown";
      const confidence = literaryForm ? "mapped" : "unknown";
      if (literaryForm) {
        fromLiteraryForm += 1;
      } else {
        unknown += 1;
      }

      wouldWrite += 1;
      if (dryRun) continue;

      safeBatchSetBookMerge(
        batch,
        doc.ref,
        {
          ontology: {
            schemaVersion: 1,
            form,
            subForm: null,
            canonicalTradition: null,
            source: "migration",
            confidence,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        {
          scriptName: "backfillOntologyFromLiteraryForm",
          bookId: doc.id,
        }
      );
      pendingWrites += 1;
    }

    if (!dryRun && pendingWrites > 0) {
      await batch.commit();
      batchCount += 1;
      written += pendingWrites;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(
      "[ONTOLOGY_BACKFILL][PAGE]",
      JSON.stringify({
        page: pages,
        scanned: total,
        skippedExistingOntology,
        wouldWrite,
        written,
        lastDocId: lastDoc.id,
        dryRun,
      })
    );

    if (snap.size < pageSize) break;
  }

  console.log(
    "[ONTOLOGY_BACKFILL][SUMMARY]",
    JSON.stringify({
      dryRun,
      totalBooksScanned: total,
      skippedExistingOntology,
      candidates: wouldWrite,
      written,
      fromLiteraryForm,
      unknown,
      batchesCommitted: batchCount,
      pageSize,
      pages,
    })
  );
}

main().catch((error) => {
  console.error("[ONTOLOGY_BACKFILL][FAIL]", error);
  process.exitCode = 1;
});
