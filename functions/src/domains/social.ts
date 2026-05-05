import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { searchSocial as searchSocialRaw } from "../social/search";
import { createSocialPost as createSocialPostRaw } from "../createSocialPost";
import {
  listSocialFeed as listSocialFeedRaw,
  getSocialPost as getSocialPostRaw,
  listSocialComments as listSocialCommentsRaw,
} from "../social/read";
import {
  addSocialComment as addSocialCommentRaw,
  likeSocialComment as likeSocialCommentRaw,
  editSocialComment as editSocialCommentRaw,
  deleteSocialComment as deleteSocialCommentRaw,
} from "../social/comments";
import { editSocialPost as editSocialPostRaw } from "../social/editPost";
import {
  deleteSocialPost as deleteSocialPostRaw,
  restoreSocialPost as restoreSocialPostRaw,
} from "../social/deletePost";
import { likeSocialPost as likeSocialPostRaw, repostSocialPost as repostSocialPostRaw } from "../social/interactions";
import {
  reportSocialComment as reportSocialCommentRaw,
  reportSocialPost as reportSocialPostRaw,
} from "../social/reporting";
import {
  applyModerationAction as applyModerationActionRaw,
  transitionModerationStage as transitionModerationStageRaw,
} from "../social/moderation";
import { incrementPostView as incrementPostViewRaw } from "../social/analytics";

export const createSocialPost = wrapCallableV2("createSocialPost", createSocialPostRaw);
export const listSocialFeed = wrapCallableV2("listSocialFeed", listSocialFeedRaw);
export const getSocialPost = wrapCallableV2("getSocialPost", getSocialPostRaw);
export const listSocialComments = wrapCallableV2("listSocialComments", listSocialCommentsRaw);
export const searchSocial = wrapCallableV2("searchSocial", searchSocialRaw);
export const addSocialComment = wrapCallableV2("addSocialComment", addSocialCommentRaw);
export const likeSocialComment = wrapCallableV2("likeSocialComment", likeSocialCommentRaw);
export const editSocialComment = wrapCallableV2("editSocialComment", editSocialCommentRaw);
export const deleteSocialComment = wrapCallableV2("deleteSocialComment", deleteSocialCommentRaw);
export const editSocialPost = wrapCallableV2("editSocialPost", editSocialPostRaw);
export const deleteSocialPost = wrapCallableV2("deleteSocialPost", deleteSocialPostRaw);
export const restoreSocialPost = wrapCallableV2("restoreSocialPost", restoreSocialPostRaw);
export const likeSocialPost = wrapCallableV2("likeSocialPost", likeSocialPostRaw);
export const repostSocialPost = wrapCallableV2("repostSocialPost", repostSocialPostRaw);
export const reportSocialPost = wrapCallableV2("reportSocialPost", reportSocialPostRaw);
export const reportSocialComment = wrapCallableV2("reportSocialComment", reportSocialCommentRaw);
export const applyModerationAction = wrapCallableV2("applyModerationAction", applyModerationActionRaw);
export const transitionModerationStage = wrapCallableV2("transitionModerationStage", transitionModerationStageRaw);
export const incrementPostView = wrapCallableV2("incrementPostView", incrementPostViewRaw);
