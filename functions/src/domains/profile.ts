import { wrapCallableV2 } from "../contracts/wrapCallableV2";
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
} from "../profile";
import {
  deleteBookReview as deleteBookReviewRaw,
  listBookReviews as listBookReviewsRaw,
  upsertBookReview as upsertBookReviewRaw,
} from "../reviews/bookReviews";

export const getPublicProfile = wrapCallableV2("getPublicProfile", getPublicProfileRaw);
export const getProfileStats = wrapCallableV2("getProfileStats", getProfileStatsRaw);
export const updateOwnProfile = wrapCallableV2("updateOwnProfile", updateOwnProfileRaw);
export const followUser = wrapCallableV2("followUser", followUserRaw);
export const unfollowUser = wrapCallableV2("unfollowUser", unfollowUserRaw);
export const getSuggestedProfiles = wrapCallableV2("getSuggestedProfiles", getSuggestedProfilesRaw);
export const listProfilePosts = wrapCallableV2("listProfilePosts", listProfilePostsRaw);
export const listProfileReviews = wrapCallableV2("listProfileReviews", listProfileReviewsRaw);
export const runReviewStackReleaseGate = wrapCallableV2("runReviewStackReleaseGate", runReviewStackReleaseGateRaw);
export const listProfileBooks = wrapCallableV2("listProfileBooks", listProfileBooksRaw);
export const listProfilePublications = wrapCallableV2("listProfilePublications", listProfilePublicationsRaw);
export const listBookReviews = wrapCallableV2("listBookReviews", listBookReviewsRaw);
export const upsertBookReview = wrapCallableV2("upsertBookReview", upsertBookReviewRaw);
export const deleteBookReview = wrapCallableV2("deleteBookReview", deleteBookReviewRaw);
