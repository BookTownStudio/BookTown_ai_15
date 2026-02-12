// scripts/runBackfill.ts
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as initClient } from "firebase/app";
import { getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

console.log("[BACKFILL] Bootstrapping…");

// 1. Admin init (authoritative)
initializeApp({
  credential: cert(
    JSON.parse(
      (globalThis as any).require("fs").readFileSync(
        "./scripts/serviceAccountKey.json",
        "utf8"
      )
    )
  ),
});

async function run() {
  try {
    console.log("[BACKFILL] Creating admin token…");

    // 2. Issue admin custom token
    const token = await getAuth().createCustomToken("admin-backfill", {
      admin: true,
      role: "superadmin",
    });

    console.log("[BACKFILL] Admin token created");

    // 3. Init Firebase client (callable requires client context)
    const app = initClient({
      apiKey: process.env.FIREBASE_API_KEY!, // REQUIRED
      authDomain: "booktown-ai.firebaseapp.com",
      projectId: "booktown-ai",
    });

    const auth = getClientAuth(app);

    console.log("[BACKFILL] Signing in with custom token…");

    await signInWithCustomToken(auth, token);

    console.log("[BACKFILL] Authenticated as admin");

    // 4. Call function
    const functions = getFunctions(app, "us-central1");
    const backfill = httpsCallable(functions, "backfillDerivedStats");

    console.log("[BACKFILL] Invoking function…");

    const result = await backfill({ confirm: true });

    console.log("[BACKFILL][SUCCESS]", result.data);
  } catch (err) {
    console.error("[BACKFILL][FAILURE]", err);
    (process as any).exit(1);
  }
}

run();