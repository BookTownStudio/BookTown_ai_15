import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import {
  listUserQuotes as listUserQuotesRaw,
  searchPublicQuotes as searchPublicQuotesRaw,
  getQuoteById as getQuoteByIdRaw,
  createQuote as createQuoteRaw,
  adminListQuotes as adminListQuotesRaw,
  adminGetQuote as adminGetQuoteRaw,
  adminQuoteCreate as adminQuoteCreateRaw,
  adminQuoteUpdate as adminQuoteUpdateRaw,
  adminQuoteArchive as adminQuoteArchiveRaw,
  saveQuoteFromReference as saveQuoteFromReferenceRaw,
} from "../quotes";
import {
  adminRegisterQuoteImport as adminRegisterQuoteImportRaw,
  adminGetQuoteImportStatus as adminGetQuoteImportStatusRaw,
} from "../admin/importQuotes";
import { processQuotesDaily } from "../admin/processQuotesDaily";

export const listUserQuotes = wrapCallableV2("listUserQuotes", listUserQuotesRaw);
export const searchPublicQuotes = wrapCallableV2("searchPublicQuotes", searchPublicQuotesRaw);
export const getQuoteById = wrapCallableV2("getQuoteById", getQuoteByIdRaw);
export const createQuote = wrapCallableV2("createQuote", createQuoteRaw);
export const adminListQuotes = wrapCallableV2("adminListQuotes", adminListQuotesRaw);
export const adminGetQuote = wrapCallableV2("adminGetQuote", adminGetQuoteRaw);
export const adminQuoteCreate = wrapCallableV2("adminQuoteCreate", adminQuoteCreateRaw);
export const adminQuoteUpdate = wrapCallableV2("adminQuoteUpdate", adminQuoteUpdateRaw);
export const adminQuoteArchive = wrapCallableV2("adminQuoteArchive", adminQuoteArchiveRaw);
export const adminRegisterQuoteImport = wrapCallableV2("adminRegisterQuoteImport", adminRegisterQuoteImportRaw);
export const adminGetQuoteImportStatus = wrapCallableV2("adminGetQuoteImportStatus", adminGetQuoteImportStatusRaw);
export const saveQuoteFromReference = wrapCallableV2("saveQuoteFromReference", saveQuoteFromReferenceRaw);
export { processQuotesDaily };
