const { FieldPath } = require("firebase-admin/firestore");

function readArg(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length).trim() : "";
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function readPositiveIntArg(name, max) {
  const raw = readArg(name);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[FIRESTORE_SCRIPT_SAFETY] Missing required --${name}=<positive integer>.`);
  }
  return Math.min(value, max);
}

function assertSafeFirestoreScript(scriptName) {
  const projectId = readArg("project-id") || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  const productionConfirmed = hasFlag("confirm-production");
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "";
  const localOnly = hasFlag("local-emulator-only");
  const dryRun = readArg("dry-run") !== "false";
  const maxDocs = readPositiveIntArg("max-docs", 5000);
  const pageSize = Math.min(readPositiveIntArg("page-size", 500), maxDocs);

  if (!projectId) {
    throw new Error(`[FIRESTORE_SCRIPT_SAFETY] ${scriptName} requires --project-id=<project id>.`);
  }

  if (!emulatorHost && (!productionConfirmed || localOnly)) {
    throw new Error(
      `[FIRESTORE_SCRIPT_SAFETY] ${scriptName} refused production Firestore access. Use local emulator or pass --confirm-production with explicit approval.`
    );
  }

  console.log("[FIRESTORE_SCRIPT_SAFETY]", JSON.stringify({
    scriptName,
    projectId,
    emulator: Boolean(emulatorHost),
    dryRun,
    maxDocs,
    pageSize,
  }));

  return {
    scriptName,
    projectId,
    dryRun,
    maxDocs,
    pageSize,
  };
}

async function readBoundedCollectionPage(collectionRef, safety) {
  const snap = await collectionRef
    .orderBy(FieldPath.documentId())
    .limit(Math.min(safety.pageSize, safety.maxDocs))
    .get();
  console.log("[FIRESTORE_SCRIPT_SAFETY][READ]", JSON.stringify({
    scriptName: safety.scriptName,
    collectionPath: collectionRef.path,
    docsRead: snap.size,
    maxDocs: safety.maxDocs,
  }));
  return snap;
}

module.exports = {
  assertSafeFirestoreScript,
  readBoundedCollectionPage,
};

