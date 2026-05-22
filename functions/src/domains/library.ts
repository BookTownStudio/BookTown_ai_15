import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { ingestBook as ingestBookRaw } from "../library/ingestBook";
import { ingestAuthor as ingestAuthorRaw } from "../library/ingestAuthor";
import { discoverAuthors as discoverAuthorsRaw } from "../library/discoverAuthors";
import { backfillAuthorMetadata as backfillAuthorMetadataRaw } from "../library/backfillAuthorMetadata";
import { backfillSeedAuthorSourceMetadata as backfillSeedAuthorSourceMetadataRaw } from "../library/backfillSeedAuthorSourceMetadata";
import { uploadUserBook as uploadUserBookRaw } from "../library/uploadUserBook";
import { finalizeUserUpload as finalizeUserUploadRaw } from "../library/finalizeUserUpload";
import {
  finalizeGoodreadsImport as finalizeGoodreadsImportRaw,
  processGoodreadsImportSessions,
  startGoodreadsImport as startGoodreadsImportRaw,
} from "../imports/goodreadsImport";
import { backfillCovers as backfillCoversRaw } from "../library/backfillCovers";
import { backfillMissingCovers as backfillMissingCoversRaw } from "../library/backfillMissingCovers";
import { backfillUserUploadCoverJobs as backfillUserUploadCoverJobsRaw } from "../library/backfillUserUploadCoverJobs";
import { processUserUploadCoverJobs } from "../library/processUserUploadCoverJobs";
import { processCoverJobs } from "../library/processCoverJobs";
import { duplicateShelf as duplicateShelfRaw } from "../shelves/duplicateShelf";
import { addBookToShelf as addBookToShelfRaw } from "../shelves/addBookToShelf";
import { removeBookFromShelf as removeBookFromShelfRaw } from "../shelves/removeBookFromShelf";
import { moveBookBetweenShelves as moveBookBetweenShelvesRaw } from "../shelves/moveBookBetweenShelves";
import { listShelfEntries as listShelfEntriesRaw } from "../shelves/listShelfEntries";
import {
  listUserShelves as listUserShelvesRaw,
  getShelf as getShelfRaw,
  createShelf as createShelfRaw,
  updateShelf as updateShelfRaw,
  deleteShelf as deleteShelfRaw,
} from "../shelves/manageShelves";
import { getBookSemanticGraph as getBookSemanticGraphRaw } from "../catalog/bookSemanticGraph";

export const ingestAuthor = wrapCallableV2("ingestAuthor", ingestAuthorRaw);
export const discoverAuthors = wrapCallableV2("discoverAuthors", discoverAuthorsRaw);
export const backfillAuthorMetadata = wrapCallableV2("backfillAuthorMetadata", backfillAuthorMetadataRaw);
export const backfillSeedAuthorSourceMetadata = wrapCallableV2("backfillSeedAuthorSourceMetadata", backfillSeedAuthorSourceMetadataRaw);
export const ingestBook = wrapCallableV2("ingestBook", ingestBookRaw);
export const uploadUserBook = wrapCallableV2("uploadUserBook", uploadUserBookRaw);
export const finalizeUserUpload = wrapCallableV2("finalizeUserUpload", finalizeUserUploadRaw);
export const startGoodreadsImport = wrapCallableV2("startGoodreadsImport", startGoodreadsImportRaw);
export const finalizeGoodreadsImport = wrapCallableV2("finalizeGoodreadsImport", finalizeGoodreadsImportRaw);
export { processGoodreadsImportSessions };
export const backfillCovers = wrapCallableV2("backfillCovers", backfillCoversRaw);
export const backfillMissingCovers = wrapCallableV2("backfillMissingCovers", backfillMissingCoversRaw);
export const backfillUserUploadCoverJobs = wrapCallableV2("backfillUserUploadCoverJobs", backfillUserUploadCoverJobsRaw);
export { processUserUploadCoverJobs };
export { processCoverJobs };
export const duplicateShelf = wrapCallableV2("duplicateShelf", duplicateShelfRaw);
export const addBookToShelf = wrapCallableV2("addBookToShelf", addBookToShelfRaw);
export const removeBookFromShelf = wrapCallableV2("removeBookFromShelf", removeBookFromShelfRaw);
export const moveBookBetweenShelves = wrapCallableV2("moveBookBetweenShelves", moveBookBetweenShelvesRaw);
export const listShelfEntries = wrapCallableV2("listShelfEntries", listShelfEntriesRaw);
export const listUserShelves = wrapCallableV2("listUserShelves", listUserShelvesRaw);
export const getShelf = wrapCallableV2("getShelf", getShelfRaw);
export const createShelf = wrapCallableV2("createShelf", createShelfRaw);
export const updateShelf = wrapCallableV2("updateShelf", updateShelfRaw);
export const deleteShelf = wrapCallableV2("deleteShelf", deleteShelfRaw);
export { syncBookSearchIndex } from "../library/search/syncBookSearchIndex";
export const getBookSemanticGraph = wrapCallableV2("getBookSemanticGraph", getBookSemanticGraphRaw);
