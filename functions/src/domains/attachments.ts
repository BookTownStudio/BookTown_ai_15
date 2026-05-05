import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { getAttachmentUrl as getAttachmentUrlRaw } from "../attachments/getAttachmentUrl";
import { createEbookAttachment as createEbookAttachmentRaw } from "../attachments/createEbookAttachment";
import { getUploadToken as getUploadTokenRaw } from "../attachments/getUploadToken";
import { finalizeMetadata as finalizeMetadataRaw } from "../attachments/finalizeMetadata";
import { logAttachmentEvents as logAttachmentEventsRaw } from "../attachments/analytics";

export const getAttachmentUrl = wrapCallableV2("getAttachmentUrl", getAttachmentUrlRaw);
export const createEbookAttachment = wrapCallableV2("createEbookAttachment", createEbookAttachmentRaw);
export const getUploadToken = wrapCallableV2("getUploadToken", getUploadTokenRaw);
export const finalizeMetadata = wrapCallableV2("finalizeMetadata", finalizeMetadataRaw);
export const logAttachmentEvents = wrapCallableV2("logAttachmentEvents", logAttachmentEventsRaw);
