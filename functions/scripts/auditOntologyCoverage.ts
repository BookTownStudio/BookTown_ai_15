#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

type CliArgs = Record<string, string | boolean>;
type MismatchSample = {
  bookId: string;
  title: string;
  literaryForm: string;
  ontologyForm: string;
};

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

function readOntologyForm(data: FirebaseFirestore.DocumentData): string {
  const ontology = data.ontology;
  if (!ontology || typeof ontology !== "object" || Array.isArray(ontology)) {
    return "";
  }
  return asNonEmptyString((ontology as Record<string, unknown>).form);
}

function pct(count: number, total: number): string {
  if (total === 0) return "0.00%";
  return `${((count / total) * 100).toFixed(2)}%`;
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
  npx ts-node scripts/auditOntologyCoverage.ts [options]

Options:
  --page-size=<n>           Default: 500, max: 1000
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

  const pageSize = asPositiveInt(args["page-size"], 500, 1000);
  const maxPages = asPositiveInt(args["max-pages"], 100000, 1000000);

  initializeAdmin(args);
  const db = getFirestore();

  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  let pages = 0;
  let totalBooks = 0;
  let withOntologyForm = 0;
  let withLiteraryForm = 0;
  let mismatchCount = 0;
  let unknownFormCount = 0;
  const mismatchSamples: MismatchSample[] = [];

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

    for (const doc of snap.docs) {
      const data = doc.data();
      totalBooks += 1;

      const ontologyForm = readOntologyForm(data);
      const literaryForm = asNonEmptyString(data.literaryForm);

      if (ontologyForm) {
        withOntologyForm += 1;
      }
      if (literaryForm) {
        withLiteraryForm += 1;
      }
      if (ontologyForm === "unknown") {
        unknownFormCount += 1;
      }
      if (ontologyForm && literaryForm && ontologyForm !== literaryForm) {
        mismatchCount += 1;
        if (mismatchSamples.length < 20) {
          mismatchSamples.push({
            bookId: doc.id,
            title:
              asNonEmptyString(data.titleEn) ||
              asNonEmptyString(data.title) ||
              asNonEmptyString(data.canonicalTitle),
            literaryForm,
            ontologyForm,
          });
        }
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  console.log(
    "[ONTOLOGY_COVERAGE][SUMMARY]",
    JSON.stringify(
      {
        totalBooks,
        withOntologyForm,
        ontologyCoverage: pct(withOntologyForm, totalBooks),
        withLiteraryForm,
        literaryFormCoverage: pct(withLiteraryForm, totalBooks),
        mismatchCount,
        mismatchRate: pct(mismatchCount, totalBooks),
        unknownFormCount,
        unknownRate: pct(unknownFormCount, totalBooks),
        sampleMismatches: mismatchSamples,
        pageSize,
        pages,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[ONTOLOGY_COVERAGE][FAIL]", error);
  process.exitCode = 1;
});
