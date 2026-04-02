import { admin } from "./firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, WriteBatch } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "./userStats/recomputeUserStats";
import { wrapCallableV2 } from "./contracts/wrapCallableV2";
import { wrapRestExport } from "./contracts/wrapRestExport";
import { ingestBook as ingestBookRaw } from "./library/ingestBook";
import { ingestAuthor as ingestAuthorRaw } from "./library/ingestAuthor";
import { discoverAuthors as discoverAuthorsRaw } from "./library/discoverAuthors";
import { backfillAuthorMetadata as backfillAuthorMetadataRaw } from "./library/backfillAuthorMetadata";
import { backfillSeedAuthorSourceMetadata as backfillSeedAuthorSourceMetadataRaw } from "./library/backfillSeedAuthorSourceMetadata";
import { uploadUserBook as uploadUserBookRaw } from "./library/uploadUserBook";
import { finalizeUserUpload as finalizeUserUploadRaw } from "./library/finalizeUserUpload";
import {
  finalizeGoodreadsImport as finalizeGoodreadsImportRaw,
  processGoodreadsImportSessions,
  startGoodreadsImport as startGoodreadsImportRaw,
} from "./imports/goodreadsImport";
import { deriveBookCovers } from "./library/deriveBookCovers";
import { backfillCovers as backfillCoversRaw } from "./library/backfillCovers";
import { backfillMissingCovers as backfillMissingCoversRaw } from "./library/backfillMissingCovers";
import { backfillUserUploadCoverJobs as backfillUserUploadCoverJobsRaw } from "./library/backfillUserUploadCoverJobs";
import { processUserUploadCoverJobs } from "./library/processUserUploadCoverJobs";
import { processCoverJobs } from "./library/processCoverJobs";
import { requestEbookReadAccess as requestEbookReadAccessRaw } from "./reader/requestEbookReadAccess";
import { recordReadingProgress as recordReadingProgressRaw } from "./reader/recordReadingProgress";
import { getReaderProgress as getReaderProgressRaw } from "./reader/getReaderProgress";
import { getReaderBookmarks as getReaderBookmarksRaw } from "./reader/getReaderBookmarks";
import { getReaderHighlights as getReaderHighlightsRaw } from "./reader/getReaderHighlights";
import { getReaderInsights as getReaderInsightsRaw } from "./reader/getReaderInsights";
import { getOrCreateReadingSession as getOrCreateReadingSessionRaw } from "./reader/getOrCreateReadingSession";
import { updateReadingSessionNarration as updateReadingSessionNarrationRaw } from "./reader/updateReadingSessionNarration";
import { requestEbookOfflineAccess as requestEbookOfflineAccessRaw } from "./reader/requestEbookOfflineAccess";
import { getReaderManifest as getReaderManifestRaw } from "./reader/getReaderManifest";
import { syncReaderOperations as syncReaderOperationsRaw } from "./reader/syncReaderOperations";
import {
  getPublicProfile as getPublicProfileRaw,
  getProfileStats as getProfileStatsRaw,
  updateOwnProfile as updateOwnProfileRaw,
  followUser as followUserRaw,
  unfollowUser as unfollowUserRaw,
  getSuggestedProfiles as getSuggestedProfilesRaw,
  listProfilePosts as listProfilePostsRaw,
  listProfileReviews as listProfileReviewsRaw,
  runReviewStackReleaseGate as runReviewStackReleaseGateRaw,
  listProfileBooks as listProfileBooksRaw,
  listProfilePublications as listProfilePublicationsRaw,
} from "./profile";
import {
  deleteBookReview as deleteBookReviewRaw,
  listBookReviews as listBookReviewsRaw,
  upsertBookReview as upsertBookReviewRaw,
} from "./reviews/bookReviews";
import { searchSocial as searchSocialRaw } from "./social/search";
import { createSocialPost as createSocialPostRaw } from "./createSocialPost";
import {
  listSocialFeed as listSocialFeedRaw,
  getSocialPost as getSocialPostRaw,
  listSocialComments as listSocialCommentsRaw,
} from "./social/read";
import {
  addSocialComment as addSocialCommentRaw,
  likeSocialComment as likeSocialCommentRaw,
  editSocialComment as editSocialCommentRaw,
  deleteSocialComment as deleteSocialCommentRaw,
} from "./social/comments";
import { editSocialPost as editSocialPostRaw } from "./social/editPost";
import {
  deleteSocialPost as deleteSocialPostRaw,
  restoreSocialPost as restoreSocialPostRaw,
} from "./social/deletePost";
import { likeSocialPost as likeSocialPostRaw, repostSocialPost as repostSocialPostRaw } from "./social/interactions";
import {
  reportSocialComment as reportSocialCommentRaw,
  reportSocialPost as reportSocialPostRaw,
} from "./social/reporting";
import {
  applyModerationAction as applyModerationActionRaw,
  transitionModerationStage as transitionModerationStageRaw,
} from "./social/moderation";
import { incrementPostView as incrementPostViewRaw } from "./social/analytics";
import { createWriteProject as createWriteProjectRaw } from "./createWriteProject";
import { deleteWriteProject as deleteWriteProjectRaw } from "./deleteWriteProject";
import { updateWriteProject as updateWriteProjectRaw } from "./updateWriteProject";
import { duplicateWriteProject as duplicateWriteProjectRaw } from "./duplicateWriteProject";
import { publishWriteProject as publishWriteProjectRaw } from "./publishWriteProject";
import { createProjectRelease as createProjectReleaseRaw } from "./createProjectRelease";
import { generateProjectReleaseEpub as generateProjectReleaseEpubRaw } from "./generateProjectReleaseEpub";
import { bridgeReleaseToCanonicalBook as bridgeReleaseToCanonicalBookRaw } from "./bridgeReleaseToCanonicalBook";
import { updatePublishedBookRights as updatePublishedBookRightsRaw } from "./updatePublishedBookRights";
import { bridgeReleaseToLongformPublication as bridgeReleaseToLongformPublicationRaw } from "./bridgeReleaseToLongformPublication";
import { getProjectPublicationSettings as getProjectPublicationSettingsRaw } from "./getProjectPublicationSettings";
import { updateLongformPublicationVisibility as updateLongformPublicationVisibilityRaw } from "./updateLongformPublicationVisibility";
import { updatePublishedBookVisibility as updatePublishedBookVisibilityRaw } from "./updatePublishedBookVisibility";
import { getProjectReleasePreview as getProjectReleasePreviewRaw } from "./getProjectReleasePreview";
import { getProjectReleaseEbookPreviewSession as getProjectReleaseEbookPreviewSessionRaw } from "./getProjectReleaseEbookPreviewSession";
import { getLongformPublication as getLongformPublicationRaw } from "./getLongformPublication";
import { getAccessibleBook as getAccessibleBookRaw } from "./getAccessibleBook";
import { listOwnLongformPublications as listOwnLongformPublicationsRaw } from "./listOwnLongformPublications";
import { createWriteProjectShareLink as createWriteProjectShareLinkRaw } from "./createWriteProjectShareLink";
import { revokeWriteProjectShareLink as revokeWriteProjectShareLinkRaw } from "./revokeWriteProjectShareLink";
import { getAttachmentUrl as getAttachmentUrlRaw } from "./attachments/getAttachmentUrl";
import { createEbookAttachment as createEbookAttachmentRaw } from "./attachments/createEbookAttachment";
import { getUploadToken as getUploadTokenRaw } from "./attachments/getUploadToken";
import { finalizeMetadata as finalizeMetadataRaw } from "./attachments/finalizeMetadata";
import { logAttachmentEvents as logAttachmentEventsRaw } from "./attachments/analytics";
import { backfillDerivedStats as backfillDerivedStatsRaw } from "./admin/backfillStats";
import { backfillReadingProgressCanonical as backfillReadingProgressCanonicalRaw } from "./admin/backfillReadingProgressCanonical";
import {
  listUserQuotes as listUserQuotesRaw,
  searchPublicQuotes as searchPublicQuotesRaw,
  getQuoteById as getQuoteByIdRaw,
  createQuote as createQuoteRaw,
  saveQuoteFromReference as saveQuoteFromReferenceRaw,
  toggleQuoteBookmark as toggleQuoteBookmarkRaw,
} from "./quotes";
import {
  createDirectConversation as createDirectConversationRaw,
  listDirectConversations as listDirectConversationsRaw,
  listDirectMessages as listDirectMessagesRaw,
  sendDirectMessage as sendDirectMessageRaw,
  markDirectConversationRead as markDirectConversationReadRaw,
} from "./messaging/directMessages";
import { aiLibrarianCallable as aiLibrarianCallableRaw } from "./ai/librarianCallable";
import { aiDiscoverAgentCallable as aiDiscoverAgentCallableRaw } from "./ai/discoverAgentCallable";
import { mutateAgentSession as mutateAgentSessionRaw } from "./agents/mutateAgentSession";
import { api as apiRaw } from "./api";
import { sitemap as sitemapRaw } from "./ssr/sitemap";
import { sitemapPublications as sitemapPublicationsRaw } from "./ssr/sitemapPublications";
import { ssrPublicPage as ssrPublicPageRaw } from "./ssr/ssrPublicPage";
import { duplicateShelf as duplicateShelfRaw } from "./shelves/duplicateShelf";
import { addBookToShelf as addBookToShelfRaw } from "./shelves/addBookToShelf";
import { removeBookFromShelf as removeBookFromShelfRaw } from "./shelves/removeBookFromShelf";
import { moveBookBetweenShelves as moveBookBetweenShelvesRaw } from "./shelves/moveBookBetweenShelves";
import {
  listUserShelves as listUserShelvesRaw,
  getShelf as getShelfRaw,
  createShelf as createShelfRaw,
  updateShelf as updateShelfRaw,
  deleteShelf as deleteShelfRaw,
} from "./shelves/manageShelves";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "./search/normalization";
import { canonicalizeRoleClaim } from "./shared/auth";

// ------------------------------------------------------------------
// Admin SDK (initialized via firebaseAdmin module)
// ------------------------------------------------------------------
const db = admin.firestore();

const DEFAULT_SHELF_METADATA = [
  { id: "want-to-read", titleEn: "Want to Read", titleAr: "أرغب في قراءته" },
  { id: "finished", titleEn: "Finished", titleAr: "انتهيت من قراءته" },
];

type BootstrapIdentity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  source: string;
};

async function ensureCanonicalRoleClaim(authUser: admin.auth.UserRecord): Promise<void> {
  const existingClaims = (authUser.customClaims ?? {}) as Record<string, unknown>;
  const canonicalRole = canonicalizeRoleClaim(existingClaims.role);
  if (existingClaims.role === canonicalRole) {
    return;
  }

  await admin.auth().setCustomUserClaims(authUser.uid, {
    ...existingClaims,
    role: canonicalRole,
  });
}

async function bootstrapUserProfileAndShelves(identity: BootstrapIdentity): Promise<string[]> {
  const { uid, source } = identity;
  const userRef = db.doc(`users/${uid}`);
  const now = FieldValue.serverTimestamp();
  const email = identity.email ?? "";
  const bootstrapName = identity.displayName ?? "New User";
  const bootstrapHandle = `@${email.split("@")[0] || "user"}`;
  const bootstrapAvatarUrl =
    identity.photoURL ||
    `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`;
  const [userSnap, publicSnap] = await Promise.all([
    userRef.get(),
    db.doc(`public_profiles/${uid}`).get(),
  ]);
  const existingUser = (userSnap.exists ? userSnap.data() : {}) || {};
  const existingPublic = (publicSnap.exists ? publicSnap.data() : {}) || {};
  const resolvedName =
    typeof existingUser.name === "string" && existingUser.name.trim()
      ? existingUser.name.trim()
      : typeof existingPublic.name === "string" && existingPublic.name.trim()
        ? existingPublic.name.trim()
        : bootstrapName;
  const resolvedHandle =
    typeof existingUser.handle === "string" && existingUser.handle.trim()
      ? existingUser.handle.trim()
      : typeof existingPublic.handle === "string" && existingPublic.handle.trim()
        ? existingPublic.handle.trim()
        : bootstrapHandle;
  const resolvedAvatarUrl =
    typeof existingUser.avatarUrl === "string" && existingUser.avatarUrl.trim()
      ? existingUser.avatarUrl.trim()
      : typeof existingPublic.avatarUrl === "string" && existingPublic.avatarUrl.trim()
        ? existingPublic.avatarUrl.trim()
        : bootstrapAvatarUrl;
  const resolvedBannerUrl =
    typeof existingUser.bannerUrl === "string" && existingUser.bannerUrl.trim()
      ? existingUser.bannerUrl.trim()
      : typeof existingPublic.bannerUrl === "string" && existingPublic.bannerUrl.trim()
        ? existingPublic.bannerUrl.trim()
        : "";
  const resolvedBioEn =
    typeof existingUser.bioEn === "string"
      ? existingUser.bioEn
      : typeof existingPublic.bioEn === "string"
        ? existingPublic.bioEn
        : "";
  const resolvedBioAr =
    typeof existingUser.bioAr === "string"
      ? existingUser.bioAr
      : typeof existingPublic.bioAr === "string"
        ? existingPublic.bioAr
        : "";
  const resolvedJoinDate =
    typeof existingUser.joinDate === "string" && existingUser.joinDate.trim()
      ? existingUser.joinDate.trim()
      : typeof existingPublic.joinDate === "string" && existingPublic.joinDate.trim()
        ? existingPublic.joinDate.trim()
        : new Date().toISOString();
  const bootstrapSearchFields = buildSearchFieldsFromTextParts([
    resolvedName,
    resolvedHandle,
    resolvedBioEn,
    resolvedBioAr,
  ]);

  logger.info("[BOOTSTRAP][START]", {
    uid,
    source,
    project: process.env.GCLOUD_PROJECT,
  });

  await db.doc(`_bootstrap_probe/${uid}`).set(
    {
      uid,
      firedAt: now,
      source,
      runtime: "v2",
    },
    { merge: true }
  );

  const batch: WriteBatch = db.batch();

  batch.set(
    userRef,
    {
      uid,
      email: email || null,
      name: resolvedName,
      handle: resolvedHandle,
      avatarUrl: resolvedAvatarUrl,
      bannerUrl: resolvedBannerUrl,
      bioEn: resolvedBioEn,
      bioAr: resolvedBioAr,
      createdAt: now,
      joinDate: resolvedJoinDate,
      lastActive: now,
      status: "active",
      isSuspended: false,
      initializationVersion: 5,
    },
    { merge: true }
  );

  const bootstrapJoinDate = new Date().toISOString();
  batch.set(
    db.doc(`public_profiles/${uid}`),
    {
      uid,
      name: resolvedName,
      handle: resolvedHandle,
      avatarUrl: resolvedAvatarUrl,
      bannerUrl: resolvedBannerUrl,
      bioEn: resolvedBioEn,
      bioAr: resolvedBioAr,
      joinDate: resolvedJoinDate || bootstrapJoinDate,
      updatedAt: bootstrapJoinDate,
      followerCount:
        typeof existingPublic.followerCount === "number"
          ? existingPublic.followerCount
          : 0,
      followingCount:
        typeof existingPublic.followingCount === "number"
          ? existingPublic.followingCount
          : 0,
      nameNormalized: normalizeSearchText(resolvedName),
      handleNormalized: normalizeSearchText(resolvedHandle),
      bioNormalized: normalizeSearchText([resolvedBioEn, resolvedBioAr].join(" ")),
      searchTokens: bootstrapSearchFields.tokens,
      searchPrefixes: bootstrapSearchFields.prefixes,
    },
    { merge: true }
  );

  for (const shelf of DEFAULT_SHELF_METADATA) {
    const shelfRef = db.collection("shelves").doc(`${uid}_${shelf.id}`);
    batch.set(
      shelfRef,
      {
        ...shelf,
        ownerId: uid,
        entries: {},
        visibility: "public",
        createdAt: now,
        updatedAt: now,
        isSystem: true,
      },
      { merge: true }
    );
  }

  await batch.commit();
  await recomputeUserStats(uid);

  logger.info("[BOOTSTRAP][SUCCESS]", {
    uid,
    source,
    shelves: DEFAULT_SHELF_METADATA.map((shelf) => shelf.id),
  });

  return DEFAULT_SHELF_METADATA.map((shelf) => shelf.id);
}

export const bootstrapCurrentUser = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const authUser = await admin.auth().getUser(request.auth.uid);
  await ensureCanonicalRoleClaim(authUser);
  const created = await bootstrapUserProfileAndShelves({
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    photoURL: authUser.photoURL ?? null,
    source: "callable.bootstrapCurrentUser",
  });

  return {
    ok: true,
    created,
  };
});

/**
 * createDefaultShelves
 * Explicit, callable bootstrap (deterministic + debuggable)
 *
 * AMENDMENT (LOCKED):
 * - Does NOT create "currently-reading"
 */
const createDefaultShelvesRaw = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const authUser = await admin.auth().getUser(request.auth.uid);
  await ensureCanonicalRoleClaim(authUser);
  const created = await bootstrapUserProfileAndShelves({
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    photoURL: authUser.photoURL ?? null,
    source: "callable.createDefaultShelves",
  });

  return {
    ok: true,
    created,
  };
});

// ------------------------------------------------------------------
// 🔒 AUTHORITATIVE INGESTION (CRITICAL EXPORT)
// ------------------------------------------------------------------
export const createDefaultShelves = wrapCallableV2(
  "createDefaultShelves",
  createDefaultShelvesRaw
);
export const ingestAuthor = wrapCallableV2("ingestAuthor", ingestAuthorRaw);
export const discoverAuthors = wrapCallableV2("discoverAuthors", discoverAuthorsRaw);
export const backfillAuthorMetadata = wrapCallableV2(
  "backfillAuthorMetadata",
  backfillAuthorMetadataRaw
);
export const backfillSeedAuthorSourceMetadata = wrapCallableV2(
  "backfillSeedAuthorSourceMetadata",
  backfillSeedAuthorSourceMetadataRaw
);
export const ingestBook = wrapCallableV2("ingestBook", ingestBookRaw);
export const uploadUserBook = wrapCallableV2(
  "uploadUserBook",
  uploadUserBookRaw
);
export const finalizeUserUpload = wrapCallableV2(
  "finalizeUserUpload",
  finalizeUserUploadRaw
);
export const startGoodreadsImport = wrapCallableV2(
  "startGoodreadsImport",
  startGoodreadsImportRaw
);
export const finalizeGoodreadsImport = wrapCallableV2(
  "finalizeGoodreadsImport",
  finalizeGoodreadsImportRaw
);
export const backfillCovers = wrapCallableV2("backfillCovers", backfillCoversRaw);
export const backfillMissingCovers = wrapCallableV2(
  "backfillMissingCovers",
  backfillMissingCoversRaw
);
export const backfillUserUploadCoverJobs = wrapCallableV2(
  "backfillUserUploadCoverJobs",
  backfillUserUploadCoverJobsRaw
);
export { processGoodreadsImportSessions };
export { processCoverJobs };

// ------------------------------------------------------------------
// 📖 READER MEDIATION (SECURE, CANONICAL)
// ------------------------------------------------------------------
export const requestEbookReadAccessV2 = wrapCallableV2(
  "requestEbookReadAccess",
  requestEbookReadAccessRaw
);
export const recordReadingProgress = wrapCallableV2(
  "recordReadingProgress",
  recordReadingProgressRaw
);
export const getReaderProgress = wrapCallableV2(
  "getReaderProgress",
  getReaderProgressRaw
);
export const getReaderBookmarks = wrapCallableV2(
  "getReaderBookmarks",
  getReaderBookmarksRaw
);
export const getReaderHighlights = wrapCallableV2(
  "getReaderHighlights",
  getReaderHighlightsRaw
);
export const getReaderInsights = wrapCallableV2(
  "getReaderInsights",
  getReaderInsightsRaw
);
export const getOrCreateReadingSession = wrapCallableV2(
  "getOrCreateReadingSession",
  getOrCreateReadingSessionRaw
);
export const updateReadingSessionNarration = wrapCallableV2(
  "updateReadingSessionNarration",
  updateReadingSessionNarrationRaw
);
export const getReaderManifest = wrapCallableV2(
  "getReaderManifest",
  getReaderManifestRaw
);
export const syncReaderOperations = wrapCallableV2(
  "syncReaderOperations",
  syncReaderOperationsRaw
);
export const requestEbookOfflineAccess = wrapCallableV2(
  "requestEbookOfflineAccess",
  requestEbookOfflineAccessRaw
);

// ------------------------------------------------------------------
// 👤 PROFILE / IDENTITY
// ------------------------------------------------------------------
export const getPublicProfile = wrapCallableV2(
  "getPublicProfile",
  getPublicProfileRaw
);
export const getProfileStats = wrapCallableV2(
  "getProfileStats",
  getProfileStatsRaw
);
export const updateOwnProfile = wrapCallableV2(
  "updateOwnProfile",
  updateOwnProfileRaw
);
export const followUser = wrapCallableV2("followUser", followUserRaw);
export const unfollowUser = wrapCallableV2("unfollowUser", unfollowUserRaw);
export const getSuggestedProfiles = wrapCallableV2(
  "getSuggestedProfiles",
  getSuggestedProfilesRaw
);
export const listProfilePosts = wrapCallableV2(
  "listProfilePosts",
  listProfilePostsRaw
);
export const listProfileReviews = wrapCallableV2(
  "listProfileReviews",
  listProfileReviewsRaw
);
export const runReviewStackReleaseGate = wrapCallableV2(
  "runReviewStackReleaseGate",
  runReviewStackReleaseGateRaw
);
export const listProfileBooks = wrapCallableV2(
  "listProfileBooks",
  listProfileBooksRaw
);
export const listProfilePublications = wrapCallableV2(
  "listProfilePublications",
  listProfilePublicationsRaw
);
export const listBookReviews = wrapCallableV2(
  "listBookReviews",
  listBookReviewsRaw
);
export const listUserShelves = wrapCallableV2(
  "listUserShelves",
  listUserShelvesRaw
);
export const getShelf = wrapCallableV2("getShelf", getShelfRaw);
export const createShelf = wrapCallableV2("createShelf", createShelfRaw);
export const updateShelf = wrapCallableV2("updateShelf", updateShelfRaw);
export const deleteShelf = wrapCallableV2("deleteShelf", deleteShelfRaw);
export const upsertBookReview = wrapCallableV2(
  "upsertBookReview",
  upsertBookReviewRaw
);
export const deleteBookReview = wrapCallableV2(
  "deleteBookReview",
  deleteBookReviewRaw
);

// ------------------------------------------------------------------
// Authoritative Service Exports
// ------------------------------------------------------------------

// Social
export const createSocialPost = wrapCallableV2(
  "createSocialPost",
  createSocialPostRaw
);
export const listSocialFeed = wrapCallableV2(
  "listSocialFeed",
  listSocialFeedRaw
);
export const getSocialPost = wrapCallableV2(
  "getSocialPost",
  getSocialPostRaw
);
export const listSocialComments = wrapCallableV2(
  "listSocialComments",
  listSocialCommentsRaw
);
export const searchSocial = wrapCallableV2(
  "searchSocial",
  searchSocialRaw
);
export const addSocialComment = wrapCallableV2(
  "addSocialComment",
  addSocialCommentRaw
);
export const likeSocialComment = wrapCallableV2(
  "likeSocialComment",
  likeSocialCommentRaw
);
export const editSocialComment = wrapCallableV2(
  "editSocialComment",
  editSocialCommentRaw
);
export const deleteSocialComment = wrapCallableV2(
  "deleteSocialComment",
  deleteSocialCommentRaw
);
export const editSocialPost = wrapCallableV2(
  "editSocialPost",
  editSocialPostRaw
);
export const deleteSocialPost = wrapCallableV2(
  "deleteSocialPost",
  deleteSocialPostRaw
);
export const restoreSocialPost = wrapCallableV2(
  "restoreSocialPost",
  restoreSocialPostRaw
);
export const likeSocialPost = wrapCallableV2(
  "likeSocialPost",
  likeSocialPostRaw
);
export const repostSocialPost = wrapCallableV2(
  "repostSocialPost",
  repostSocialPostRaw
);
export const reportSocialPost = wrapCallableV2(
  "reportSocialPost",
  reportSocialPostRaw
);
export const reportSocialComment = wrapCallableV2(
  "reportSocialComment",
  reportSocialCommentRaw
);
export const applyModerationAction = wrapCallableV2(
  "applyModerationAction",
  applyModerationActionRaw
);
export const transitionModerationStage = wrapCallableV2(
  "transitionModerationStage",
  transitionModerationStageRaw
);
export const incrementPostView = wrapCallableV2(
  "incrementPostView",
  incrementPostViewRaw
);
export const duplicateShelf = wrapCallableV2(
  "duplicateShelf",
  duplicateShelfRaw
);
export const addBookToShelf = wrapCallableV2(
  "addBookToShelf",
  addBookToShelfRaw
);
export const removeBookFromShelf = wrapCallableV2(
  "removeBookFromShelf",
  removeBookFromShelfRaw
);
export const moveBookBetweenShelves = wrapCallableV2(
  "moveBookBetweenShelves",
  moveBookBetweenShelvesRaw
);

// Quotes
export const listUserQuotes = wrapCallableV2(
  "listUserQuotes",
  listUserQuotesRaw
);
export const searchPublicQuotes = wrapCallableV2(
  "searchPublicQuotes",
  searchPublicQuotesRaw
);
export const getQuoteById = wrapCallableV2("getQuoteById", getQuoteByIdRaw);
export const createQuote = wrapCallableV2("createQuote", createQuoteRaw);
export const saveQuoteFromReference = wrapCallableV2(
  "saveQuoteFromReference",
  saveQuoteFromReferenceRaw
);
export const toggleQuoteBookmark = wrapCallableV2(
  "toggleQuoteBookmark",
  toggleQuoteBookmarkRaw
);

// Messaging
export const createDirectConversation = wrapCallableV2(
  "createDirectConversation",
  createDirectConversationRaw
);
export const listDirectConversations = wrapCallableV2(
  "listDirectConversations",
  listDirectConversationsRaw
);
export const listDirectMessages = wrapCallableV2(
  "listDirectMessages",
  listDirectMessagesRaw
);
export const sendDirectMessage = wrapCallableV2(
  "sendDirectMessage",
  sendDirectMessageRaw
);
export const markDirectConversationRead = wrapCallableV2(
  "markDirectConversationRead",
  markDirectConversationReadRaw
);

// Write
export const createWriteProject = wrapCallableV2(
  "createWriteProject",
  createWriteProjectRaw
);
export const deleteWriteProject = wrapCallableV2(
  "deleteWriteProject",
  deleteWriteProjectRaw
);
export const updateWriteProject = wrapCallableV2(
  "updateWriteProject",
  updateWriteProjectRaw
);
export const duplicateWriteProject = wrapCallableV2(
  "duplicateWriteProject",
  duplicateWriteProjectRaw
);
export const publishWriteProject = wrapCallableV2(
  "publishWriteProject",
  publishWriteProjectRaw
);
export const createProjectRelease = wrapCallableV2(
  "createProjectRelease",
  createProjectReleaseRaw
);
export const generateProjectReleaseEpub = wrapCallableV2(
  "generateProjectReleaseEpub",
  generateProjectReleaseEpubRaw
);
export const bridgeReleaseToCanonicalBook = wrapCallableV2(
  "bridgeReleaseToCanonicalBook",
  bridgeReleaseToCanonicalBookRaw
);
export const updatePublishedBookRights = wrapCallableV2(
  "updatePublishedBookRights",
  updatePublishedBookRightsRaw
);
export const getProjectPublicationSettings = wrapCallableV2(
  "getProjectPublicationSettings",
  getProjectPublicationSettingsRaw
);
export const updateLongformPublicationVisibility = wrapCallableV2(
  "updateLongformPublicationVisibility",
  updateLongformPublicationVisibilityRaw
);
export const updatePublishedBookVisibility = wrapCallableV2(
  "updatePublishedBookVisibility",
  updatePublishedBookVisibilityRaw
);
export const bridgeReleaseToLongformPublication = wrapCallableV2(
  "bridgeReleaseToLongformPublication",
  bridgeReleaseToLongformPublicationRaw
);
export const getProjectReleasePreview = wrapCallableV2(
  "getProjectReleasePreview",
  getProjectReleasePreviewRaw
);
export const getProjectReleaseEbookPreviewSession = wrapCallableV2(
  "getProjectReleaseEbookPreviewSession",
  getProjectReleaseEbookPreviewSessionRaw
);
export const getLongformPublication = wrapCallableV2(
  "getLongformPublication",
  getLongformPublicationRaw
);
export const getAccessibleBook = wrapCallableV2(
  "getAccessibleBook",
  getAccessibleBookRaw
);
export const listOwnLongformPublications = wrapCallableV2(
  "listOwnLongformPublications",
  listOwnLongformPublicationsRaw
);
export const createWriteProjectShareLink = wrapCallableV2(
  "createWriteProjectShareLink",
  createWriteProjectShareLinkRaw
);
export const revokeWriteProjectShareLink = wrapCallableV2(
  "revokeWriteProjectShareLink",
  revokeWriteProjectShareLinkRaw
);

// Attachments
export const getAttachmentUrl = wrapCallableV2(
  "getAttachmentUrl",
  getAttachmentUrlRaw
);
export const createEbookAttachment = wrapCallableV2(
  "createEbookAttachment",
  createEbookAttachmentRaw
);
export const getUploadToken = wrapCallableV2(
  "getUploadToken",
  getUploadTokenRaw
);
export const finalizeMetadata = wrapCallableV2(
  "finalizeMetadata",
  finalizeMetadataRaw
);
export const logAttachmentEvents = wrapCallableV2(
  "logAttachmentEvents",
  logAttachmentEventsRaw
);

// Admin
export const backfillDerivedStats = wrapCallableV2(
  "backfillDerivedStats",
  backfillDerivedStatsRaw
);
export const backfillReadingProgressCanonical = wrapCallableV2(
  "backfillReadingProgressCanonical",
  backfillReadingProgressCanonicalRaw
);
export { scheduledNotificationCleanup } from "./admin/cleanupNotifications";
export { scheduledAttachmentCleanup } from "./admin/cleanupAttachments";
export { scheduledReviewAggregateReconcile } from "./admin/reconcileReviewAggregates";
export {
  listDeletionRequests,
  createDeletionRequest,
  reviewDeletionRequest,
  executeDeletion,
} from "./control/deleteRequests";
export { searchUsersForAdmin } from "./control/adminUserDiscovery";
export {
  getSystemMetricsSnapshot,
  getSystemMetricsDailyRange,
} from "./control/analyticsMetrics";
export {
  getRecentSystemEvents,
  getSystemHealthSnapshot,
} from "./control/systemEventsAdmin";
export { purgeDeletedUsers } from "./control/purgeDeletedUsers";
export { exportDailyAnalyticsSnapshot } from "./analytics/dailyExport";
export {
  onIntelligenceSignalQueued,
  scheduledIntelligenceProfileBuilder,
  scheduledIntelligenceQueueCleanup,
} from "./intelligence/profileBuilder";
export { scheduledIntelligenceProfileReconciliation } from "./intelligence/reconciliation";
export { scheduledLibrarianAggregationWorker } from "./intelligence/aggregationWorker";
export { scheduledIntelligenceAuditWorker } from "./intelligence/auditWorker";
export { scheduledIntelligenceDriftMonitor } from "./intelligence/driftMonitor";

// SSR
export const sitemap = sitemapRaw;
export const sitemapPublications = sitemapPublicationsRaw;
export const ssrPublicPage = ssrPublicPageRaw;

// Triggers
export * from "./triggers/aggregationTriggers";
export * from "./triggers/notificationTriggers";
export * from "./triggers/activityTriggers";
export * from "./triggers/searchTriggers";
export { syncBookSearchIndex } from "./library/search/syncBookSearchIndex";
export { processUserUploadCoverJobs };

// REST API (CRITICAL WIRING)
export const api = wrapRestExport(apiRaw);
export const aiLibrarian = aiLibrarianCallableRaw;
export const aiDiscoverAgent = aiDiscoverAgentCallableRaw;
export const mutateAgentSession = mutateAgentSessionRaw;
