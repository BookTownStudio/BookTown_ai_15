// ------------------------------------------------------------------
// BookTown Cloud Functions — entry point
//
// This file is a thin re-export hub.  All business logic lives in
// domain modules under functions/src/domains/ and functions/src/user/.
//
// Cold-start note:
//   aiLibrarian and aiDiscoverAgent use dynamic imports inside their
//   onCall handlers (see domains/ai.ts) so that librarian.ts (5,000+
//   lines) and @google-cloud/vertexai are NOT evaluated on cold-start
//   of unrelated functions.
// ------------------------------------------------------------------

// User bootstrap
export * from "./user/bootstrap";

// Domain modules
export * from "./domains/library";
export * from "./domains/reader";
export * from "./domains/social";
export * from "./domains/profile";
export * from "./domains/write";
export * from "./domains/quotes";
export * from "./domains/messaging";
export * from "./domains/attachments";
export * from "./domains/spaces";
export * from "./domains/admin";
export * from "./domains/ai";
export * from "./domains/home";
export * from "./domains/feedback";
export * from "./domains/ssr";

// Triggers
export * from "./triggers/aggregationTriggers";
export * from "./triggers/notificationTriggers";
export * from "./triggers/activityTriggers";
export * from "./triggers/searchTriggers";
export * from "./triggers/attachmentTriggers";
