import { admin } from "../firebaseAdmin";

const db = admin.firestore();
const METRIC_EVENT_LEDGER_COLLECTION = "metric_event_ledger";

function normalizeEventId(eventId: string): string {
  if (typeof eventId !== "string") {
    throw new Error("metric event id must be a string.");
  }

  const normalized = eventId.trim();
  if (!normalized) {
    throw new Error("metric event id cannot be empty.");
  }

  return normalized;
}

export async function processMetricEventIdempotently(
  eventId: string,
  handler: (tx: FirebaseFirestore.Transaction) => Promise<void>
): Promise<boolean> {
  const normalizedEventId = normalizeEventId(eventId);
  let processed = false;

  await db.runTransaction(async (tx) => {
    const ledgerRef = db
      .collection(METRIC_EVENT_LEDGER_COLLECTION)
      .doc(normalizedEventId);
    const ledgerSnap = await tx.get(ledgerRef);

    if (ledgerSnap.exists) {
      return;
    }

    tx.create(ledgerRef, {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await handler(tx);
    processed = true;
  });

  return processed;
}
