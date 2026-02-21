const admin = require("firebase-admin");

admin.initializeApp({
  projectId: "booktown-ai",
});

const uid = "CwRxG1Kyykaw4koGJdYcniGsEdi1";

async function promote() {
  await admin.auth().setCustomUserClaims(uid, {
    role: "superadmin",
    admin: true,
  });

  console.log("✅ Promoted to superadmin:", uid);
  process.exit(0);
}

promote().catch((err) => {
  console.error("❌ Promotion failed:", err);
  process.exit(1);
});