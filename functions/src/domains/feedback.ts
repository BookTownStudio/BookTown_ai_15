import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import {
  adminAddFeedbackNote as adminAddFeedbackNoteRaw,
  adminExportFeedbackCsv as adminExportFeedbackCsvRaw,
  adminExportFeedbackJson as adminExportFeedbackJsonRaw,
  adminGetFeedbackReport as adminGetFeedbackReportRaw,
  adminListFeedbackReports as adminListFeedbackReportsRaw,
  adminUpdateFeedbackStatus as adminUpdateFeedbackStatusRaw,
} from "../feedback/adminFeedback";
import {
  adminDeleteFeedbackAttachment as adminDeleteFeedbackAttachmentRaw,
  createFeedbackAttachmentUpload as createFeedbackAttachmentUploadRaw,
  finalizeFeedbackAttachment as finalizeFeedbackAttachmentRaw,
} from "../feedback/feedbackAttachments";
import { submitFeedback as submitFeedbackRaw } from "../feedback/submitFeedback";

export const submitFeedback = wrapCallableV2("submitFeedback", submitFeedbackRaw);
export const adminListFeedbackReports = wrapCallableV2("adminListFeedbackReports", adminListFeedbackReportsRaw);
export const adminGetFeedbackReport = wrapCallableV2("adminGetFeedbackReport", adminGetFeedbackReportRaw);
export const adminUpdateFeedbackStatus = wrapCallableV2("adminUpdateFeedbackStatus", adminUpdateFeedbackStatusRaw);
export const adminAddFeedbackNote = wrapCallableV2("adminAddFeedbackNote", adminAddFeedbackNoteRaw);
export const adminExportFeedbackCsv = wrapCallableV2("adminExportFeedbackCsv", adminExportFeedbackCsvRaw);
export const adminExportFeedbackJson = wrapCallableV2("adminExportFeedbackJson", adminExportFeedbackJsonRaw);
export const createFeedbackAttachmentUpload = wrapCallableV2("createFeedbackAttachmentUpload", createFeedbackAttachmentUploadRaw);
export const finalizeFeedbackAttachment = wrapCallableV2("finalizeFeedbackAttachment", finalizeFeedbackAttachmentRaw);
export const adminDeleteFeedbackAttachment = wrapCallableV2("adminDeleteFeedbackAttachment", adminDeleteFeedbackAttachmentRaw);
