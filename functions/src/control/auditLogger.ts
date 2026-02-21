import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";

export interface AdminAuditEntry {
  actorUid: string;
  actorRole: string;
  actionType: string;
  targetType: string;
  targetId: string;
  payloadSnapshot?: unknown;
  timestamp: FirebaseFirestore.FieldValue;
}

export async function logAdminAction(
  entry: Omit<AdminAuditEntry, "timestamp">
): Promise<void> {
  await admin.firestore().collection("audit_log").add({
    ...entry,
    timestamp: FieldValue.serverTimestamp(),
  });
}

